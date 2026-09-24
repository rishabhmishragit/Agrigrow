import { describe, expect, it } from "vitest";
import { emptyDatabase } from "../db";
import { calculateConsignmentSettlement } from "../economics";
import { AppError } from "../errors";
import { createSeed } from "../seed";
import {
  acceptDelivery,
  authenticateDemo,
  commitToLot,
  confirmCollection,
  confirmDelivery,
  confirmEscrowFunding,
  createListing,
  createLot,
  departWithLoad,
  flushSync,
  initiateEscrow,
  recordInspection,
  recordTemperature,
  releaseEscrow,
  scheduleCollection,
} from "../index";
import type { AppDatabase, Ports } from "../index";
import { handleUssd } from "../ussdGateway";
import { MockEscrowProvider } from "../../providers/escrow";
import { MockObjectStorage, MockSmsProvider, MockTrackingProvider } from "../../providers/messaging";
import { MockPaymentProvider } from "../../providers/payment";

function ports() {
  let n = 0;
  const payment = new MockPaymentProvider();
  const escrow = new MockEscrowProvider();
  const sms = new MockSmsProvider();
  const kit: Ports = {
    now: () => "2026-09-23T12:00:00.000Z",
    id: (prefix) => `${prefix}_${++n}`,
    payment,
    escrow,
    sms,
    tracking: new MockTrackingProvider(),
    storage: new MockObjectStorage(),
    escrowBankLabel: "External trust account (bank not yet selected)",
  };
  return { kit, payment, escrow, sms };
}

function fixture(): AppDatabase {
  const db = emptyDatabase();
  db.produce.push({ id: "prod_tomato", name: "Tomato", defaultUnit: "kg" });
  db.gradeScales.push({
    id: "scale_tomato",
    produceId: "prod_tomato",
    grades: [
      { code: "A", label: "Grade A", acceptable: true },
      { code: "R", label: "Reject", acceptable: false },
    ],
  });
  db.users.push(
    { id: "ops", role: "ops", fullName: "Ops", phone: "+233200000001", email: "ops@test.com", location: "Accra", active: true, createdAt: "2026-09-23T12:00:00.000Z" },
    { id: "fa", role: "farmer", fullName: "Farmer A", phone: "+233200000002", email: "a@test.com", location: "Techiman", active: true, createdAt: "2026-09-23T12:00:00.000Z" },
    { id: "fb", role: "farmer", fullName: "Farmer B", phone: "+233200000003", email: "b@test.com", location: "Techiman", active: true, createdAt: "2026-09-23T12:00:00.000Z" },
    { id: "off", role: "offtaker", fullName: "Buyer", phone: "+233200000004", email: "offtaker@test.com", location: "Accra", active: true, createdAt: "2026-09-23T12:00:00.000Z" },
    { id: "ag", role: "field_agent", fullName: "Agent", phone: "+233200000005", email: "agent@test.com", location: "Techiman", active: true, createdAt: "2026-09-23T12:00:00.000Z" },
    { id: "dr", role: "driver", fullName: "Driver", phone: "+233200000006", email: "driver@test.com", location: "Kumasi", active: true, createdAt: "2026-09-23T12:00:00.000Z" },
  );
  db.farmerProfiles.push(
    { id: "pfa", userId: "fa", village: "Techiman", community: "Tuobodom", produceIds: ["prod_tomato"], phoneVerified: true, locationLabel: "Techiman" },
    { id: "pfb", userId: "fb", village: "Techiman", community: "Tanoso", produceIds: ["prod_tomato"], phoneVerified: true, locationLabel: "Techiman" },
  );
  db.offtakerProfiles.push({ id: "poff", userId: "off", organization: "Accra Fresh", deliveryLocation: "Accra", latitude: 5.6, longitude: -0.18 });
  db.fieldAgentProfiles.push({ id: "pag", userId: "ag", baseLocation: "Techiman", assignedArea: "Techiman" });
  db.driverProfiles.push({ id: "pdr", userId: "dr", licenseRef: "DL", vehicleId: "veh" });
  db.vehicles.push({ id: "veh", plate: "GS 2140-26", type: "Refrigerated truck", coldCapable: true, ownerLabel: "Charter" });
  return db;
}

async function list(db: AppDatabase, kit: Ports, userId: string, farmerId: string, quantity: number) {
  return createListing(db, kit, userId, {
    produceId: "prod_tomato",
    quantity,
    unit: "kg",
    availableDate: "2026-09-24",
    pickupLocation: "Techiman",
    farmerId,
  });
}

describe("consignment economics", () => {
  it("allocates the collection fee by weight", () => {
    const light = calculateConsignmentSettlement({
      confirmedWeight: 250,
      pricePerUnit: 10,
      consignmentWeight: 250,
      totalStopWeight: 1000,
      stopCollectionFee: 100,
    });
    const heavy = calculateConsignmentSettlement({
      confirmedWeight: 750,
      pricePerUnit: 10,
      consignmentWeight: 750,
      totalStopWeight: 1000,
      stopCollectionFee: 100,
    });
    expect(light.collectionFee).toBe(0);
    expect(heavy.collectionFee).toBe(0);
    expect(light.netSettlement).toBe(2500);
    expect(heavy.netSettlement).toBe(7500);
  });

  it("caps a farmer collection fee at 5 percent of that farmer's value", () => {
    const small = calculateConsignmentSettlement({
      confirmedWeight: 50,
      pricePerUnit: 4,
      consignmentWeight: 50,
      totalStopWeight: 1000,
      stopCollectionFee: 400,
    });
    const large = calculateConsignmentSettlement({
      confirmedWeight: 950,
      pricePerUnit: 4,
      consignmentWeight: 950,
      totalStopWeight: 1000,
      stopCollectionFee: 400,
    });
    expect(small.grossValue).toBe(200);
    expect(small.collectionFee).toBe(0);
    expect(small.netSettlement).toBe(200);
    expect(large.collectionFee).toBe(0);
    expect(large.netSettlement).toBe(3800);
  });
});

describe("trade workflow", () => {
  it("walks listing, lot, escrow, offline field work, custody, acceptance and settlement", async () => {
    const { kit, payment, escrow } = ports();
    let db = fixture();
    const listedA = await list(db, kit, "fa", "pfa", 50);
    db = listedA.db;
    const listedB = await list(db, kit, "fb", "pfb", 950);
    db = listedB.db;
    expect(listedA.data.status).toBe("AVAILABLE");

    const lotResult = await createLot(db, kit, "ops", {
      listingIds: [listedA.data.id, listedB.data.id],
      destination: "Accra",
      pricePerUnit: 4,
      collectionFee: 400,
      gradeExpectation: "A",
      deliveryWindowStart: "2026-09-25",
      deliveryWindowEnd: "2026-09-26",
      publish: true,
    });
    db = lotResult.db;
    expect(lotResult.data.consignments).toHaveLength(2);
    expect(new Set(lotResult.data.consignments.map((item) => item.farmerId)).size).toBe(2);
    expect(lotResult.data.consignments.every((item) => item.farmerId)).toBe(true);

    const committed = await commitToLot(db, kit, "off", lotResult.data.lot.id);
    db = committed.db;
    expect(committed.data.orderState).toBe("COMMITTED");
    const opened = await initiateEscrow(db, kit, "off", committed.data.id);
    db = opened.db;
    expect(opened.data.status).toBe("PENDING");
    expect(opened.data.instructedAmountGhs).toBe(50 * 4 + 950 * 4);
    expect("balance" in opened.data).toBe(false);

    await expect(
      scheduleCollection(db, kit, "ops", {
        lotId: lotResult.data.lot.id,
        fieldAgentId: "pag",
        driverId: "pdr",
        vehicleId: "veh",
        scheduledDate: "2026-09-24",
        windowLabel: "08:00-11:00",
      }),
    ).rejects.toThrow(/payment has not been confirmed/);

    escrow.simulateBankFunding(opened.data.externalReference);
    const funded = await confirmEscrowFunding(db, kit, "ops", opened.data.id);
    db = funded.db;
    expect(db.lots.find((item) => item.id === lotResult.data.lot.id)?.orderState).toBe("ESCROW_FUNDED");
    const fundedAgain = await confirmEscrowFunding(db, kit, "ops", opened.data.id);
    expect(fundedAgain.message).toMatch(/already confirmed/);

    const scheduled = await scheduleCollection(db, kit, "ops", {
      lotId: lotResult.data.lot.id,
      fieldAgentId: "pag",
      driverId: "pdr",
      vehicleId: "veh",
      scheduledDate: "2026-09-24",
      windowLabel: "08:00-11:00",
    });
    db = scheduled.db;
    expect(db.lots.find((item) => item.id === lotResult.data.lot.id)?.orderState).toBe("COLLECTION_SCHEDULED");

    const [first, second] = db.consignments.filter((item) => item.lotId === lotResult.data.lot.id);
    const offline = await recordInspection(db, kit, "ag", {
      consignmentId: first.id,
      actualQuantity: 50,
      rejectedQuantity: 0,
      gradeCode: "A",
      idempotencyKey: "insp-a",
      offline: true,
      photoUris: ["file://local/a.jpg"],
    });
    db = offline.db;
    expect(offline.message).toMatch(/offline/i);
    expect(offline.data.syncStatus).toBe("PENDING");
    expect(offline.data.gradeCode).toBe("A");
    expect(db.lots.find((item) => item.id === lotResult.data.lot.id)?.orderState).toBe("COLLECTION_SCHEDULED");
    expect(db.grades).toHaveLength(0);

    const flushed = await flushSync(db, kit, "ag");
    db = flushed.db;
    expect(flushed.data.synced).toBe(1);
    expect(db.grades).toHaveLength(1);
    expect(db.weights).toHaveLength(1);
    expect(db.inspections[0].syncStatus).toBe("SYNCED");
    const flushedAgain = await flushSync(db, kit, "ag");
    db = flushedAgain.db;
    expect(db.grades).toHaveLength(1);
    expect(db.weights).toHaveLength(1);

    const secondInspection = await recordInspection(db, kit, "ag", {
      consignmentId: second.id,
      actualQuantity: 950,
      rejectedQuantity: 0,
      gradeCode: "A",
      idempotencyKey: "insp-b",
      offline: false,
    });
    db = secondInspection.db;
    expect(db.lots.find((item) => item.id === lotResult.data.lot.id)?.orderState).toBe("FIELD_CONFIRMED");

    const stop = db.stops.find((item) => item.kind === "COLLECTION" && item.lotId === lotResult.data.lot.id)!;
    const deliveryStop = db.stops.find((item) => item.kind === "DELIVERY" && item.lotId === lotResult.data.lot.id)!;
    await expect(
      confirmCollection(db, kit, "dr", { stopId: stop.id, idempotencyKey: "col-1", offline: false }),
    ).rejects.toThrow(/temperature/i);

    const temp = await recordTemperature(db, kit, "dr", {
      stopId: stop.id,
      temperature: 9,
      unit: "C",
      idempotencyKey: "temp-col",
      offline: false,
    });
    db = temp.db;
    const collected = await confirmCollection(db, kit, "dr", { stopId: stop.id, idempotencyKey: "col-1", offline: false });
    db = collected.db;
    expect(collected.data.orderState).toBe("COLLECTED");
    const transit = await departWithLoad(db, kit, "dr", lotResult.data.lot.id);
    db = transit.db;
    expect(transit.data.orderState).toBe("IN_TRANSIT");

    const deliveryTemp = await recordTemperature(db, kit, "dr", {
      stopId: deliveryStop.id,
      temperature: 10,
      unit: "C",
      idempotencyKey: "temp-del",
      offline: false,
    });
    db = deliveryTemp.db;
    const delivered = await confirmDelivery(db, kit, "dr", {
      stopId: deliveryStop.id,
      receiverName: "Store clerk",
      signatureName: "Store clerk",
      idempotencyKey: "pod-1",
      offline: false,
      photoUris: ["file://pod.jpg"],
    });
    db = delivered.db;
    expect(db.lots.find((item) => item.id === lotResult.data.lot.id)?.orderState).toBe("DELIVERED");

    const accepted = await acceptDelivery(db, kit, "off", lotResult.data.lot.id);
    db = accepted.db;
    expect(accepted.data.orderState).toBe("ACCEPTED");
    await expect(releaseEscrow(db, kit, "fa", lotResult.data.lot.id)).rejects.toThrow(/operations team/i);

    const released = await releaseEscrow(db, kit, "ops", lotResult.data.lot.id);
    db = released.db;
    expect(db.lots.find((item) => item.id === lotResult.data.lot.id)?.orderState).toBe("SETTLED");
    const small = released.data.settlements.find((item) => item.netSettlement === 200);
    const large = released.data.settlements.find((item) => item.netSettlement === 3800);
    expect(small?.collectionFee).toBe(0);
    expect(large?.collectionFee).toBe(0);
    expect(payment.calls).toHaveLength(2);
    expect(escrow.releaseCalls).toBe(1);

    const duplicate = await releaseEscrow(db, kit, "ops", lotResult.data.lot.id);
    expect(duplicate.data.alreadyReleased).toBe(true);
    expect(escrow.releaseCalls).toBe(1);
    expect(payment.calls).toHaveLength(2);
    expect(db.payments).toHaveLength(2);
    expect(db.smsMessages.some((item) => item.event === "payout_completed")).toBe(true);
  });

  it("rejects an invalid order transition", async () => {
    const { kit } = ports();
    let db = fixture();
    const listed = await list(db, kit, "fa", "pfa", 10);
    db = listed.db;
    const lot = await createLot(db, kit, "ops", {
      listingIds: [listed.data.id],
      destination: "Accra",
      pricePerUnit: 4,
      collectionFee: 10,
      gradeExpectation: "A",
      deliveryWindowStart: "2026-09-25",
      deliveryWindowEnd: "2026-09-26",
      publish: true,
    });
    await expect(acceptDelivery(lot.db, kit, "off", lot.data.lot.id)).rejects.toBeInstanceOf(AppError);
  });
});

describe("access and demo data", () => {
  it("signs in a development account and keeps the role from the user record", () => {
    const { kit } = ports();
    const db = createSeed();
    const signedIn = authenticateDemo(db, kit, "farmer@test.com", "cryochain-dev", "cryochain-dev", true);
    expect(signedIn.data.role).toBe("farmer");
    expect(() => authenticateDemo(db, kit, "farmer@test.com", "nope", "cryochain-dev", true)).toThrow(/not recognised/);
  });

  it("keeps seed relationships and paid settlement math", () => {
    const db = createSeed();
    expect(db.farmerProfiles).toHaveLength(10);
    expect(db.offtakerProfiles).toHaveLength(2);
    expect(db.fieldAgentProfiles).toHaveLength(3);
    expect(db.driverProfiles).toHaveLength(3);
    expect(db.vehicles).toHaveLength(3);
    expect(db.lots.every((lot) => db.consignments.some((item) => item.lotId === lot.id))).toBe(true);
    expect(db.consignments.every((item) => db.farmerProfiles.some((farmer) => farmer.id === item.farmerId))).toBe(true);
    expect(db.escrows.some((item) => item.status === "FUNDED")).toBe(true);
    expect(db.lots.some((item) => item.orderState === "ACCEPTED")).toBe(true);
    expect(db.lots.some((item) => item.orderState === "IN_TRANSIT")).toBe(true);
    expect(db.exceptions.length).toBeGreaterThanOrEqual(4);
    const paid = db.settlements.find((item) => item.id === "set_akua")!;
    expect(paid.grossValue).toBe(1000);
    expect(paid.collectionFee).toBe(0);
    expect(paid.netSettlement).toBe(1000);
    expect(db.escrows.every((item) => !("balance" in item))).toBe(true);
  });

  it("maps USSD input onto the same listing records", async () => {
    const { kit } = ports();
    let db = createSeed();
    const started = await handleUssd(db, kit, { sessionId: "ussd1", phone: "+233244009999", text: "", start: true });
    db = started.db;
    expect(started.data.response).toMatch(/Register/);
    const name = await handleUssd(db, kit, { sessionId: "ussd1", phone: "+233244009999", text: "1", start: false });
    db = name.db;
    const named = await handleUssd(db, kit, { sessionId: "ussd1", phone: "+233244009999", text: "Akosua Demo", start: false });
    db = named.db;
    const village = await handleUssd(db, kit, { sessionId: "ussd1", phone: "+233244009999", text: "Techiman", start: false });
    db = village.db;
    const registered = await handleUssd(db, kit, { sessionId: "ussd1", phone: "+233244009999", text: "Tomato", start: false });
    db = registered.db;
    expect(db.farmerProfiles.some((item) => item.village === "Techiman" && item.userId !== "u_akua")).toBe(true);
    const again = await handleUssd(db, kit, { sessionId: "ussd2", phone: "+233244009999", text: "", start: true });
    db = again.db;
    const menu = await handleUssd(db, kit, { sessionId: "ussd2", phone: "+233244009999", text: "2", start: false });
    db = menu.db;
    const produce = await handleUssd(db, kit, { sessionId: "ussd2", phone: "+233244009999", text: "Tomato", start: false });
    db = produce.db;
    const qty = await handleUssd(db, kit, { sessionId: "ussd2", phone: "+233244009999", text: "25", start: false });
    db = qty.db;
    const date = await handleUssd(db, kit, { sessionId: "ussd2", phone: "+233244009999", text: "2026-09-28", start: false });
    db = date.db;
    const saved = await handleUssd(db, kit, { sessionId: "ussd2", phone: "+233244009999", text: "Techiman", start: false });
    db = saved.db;
    const farmer = db.farmerProfiles.find((item) => db.users.some((user) => user.id === item.userId && user.phone === "+233244009999"));
    expect(db.listings.some((item) => item.farmerId === farmer?.id && item.quantity === 25)).toBe(true);
  });
});
