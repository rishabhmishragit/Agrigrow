import { must } from "./db";
import { calculateConsignmentSettlement } from "./economics";
import { AppError } from "./errors";
import { logEvent } from "./logger";
import {
  actor,
  audit,
  begin,
  claimIdempotency,
  CommandResult,
  notify,
  offtakerForUser,
  orderStateOf,
  Ports,
  requireRole,
  sendSms,
  setOrder,
  userByFarmer,
} from "./support";
import type { AppDatabase, Payment, Settlement } from "./types";

export async function acceptDelivery(
  source: AppDatabase,
  ports: Ports,
  userId: string,
  lotId: string,
): Promise<CommandResult<{ orderState: string }>> {
  const db = begin(source);
  const user = actor(db, userId);
  requireRole(user, ["offtaker"], "Only the offtaker can accept a delivery.");
  const commitment = must(db.commitments.find((item) => item.lotId === lotId), "Commitment was not found.");
  if (offtakerForUser(db, user.id).id !== commitment.offtakerId) {
    throw new AppError("FORBIDDEN", "You can only accept your own delivery.");
  }
  if (orderStateOf(db, lotId) !== "DELIVERED") {
    throw new AppError("INVALID_STATE", "Accept the delivery only after the driver confirms it.");
  }
  commitment.acceptedAt = ports.now();
  setOrder(db, ports, user, lotId, "ACCEPTED", "DELIVERY_ACCEPTED");
  const lot = must(db.lots.find((item) => item.id === lotId), "Lot was not found.");
  for (const ops of db.users.filter((item) => item.role === "ops")) {
    notify(db, ports, ops.id, "Delivery accepted", `${lot.code} was accepted. Escrow can be released.`, "Lot", lot.id);
  }
  for (const consignment of db.consignments.filter((item) => item.lotId === lot.id)) {
    const farmerUser = userByFarmer(db, consignment.farmerId);
    await sendSms(db, ports, {
      to: farmerUser.phone,
      userId: farmerUser.id,
      event: "offtaker_accepted",
      idempotencyKey: `sms:accepted:${commitment.id}:${consignment.id}`,
      body: `CryoChain: the buyer accepted ${lot.code}. Payment follows escrow release.`,
    });
  }
  return { db, data: { orderState: "ACCEPTED" } };
}

export interface ReleaseResult {
  alreadyReleased: boolean;
  settlements: Settlement[];
  payments: Payment[];
}

export async function releaseEscrow(
  source: AppDatabase,
  ports: Ports,
  userId: string,
  lotId: string,
): Promise<CommandResult<ReleaseResult>> {
  const db = begin(source);
  const user = actor(db, userId);
  requireRole(user, ["ops"], "Only the operations team can release escrow.");
  const lot = must(db.lots.find((item) => item.id === lotId), "Lot was not found.");
  const commitment = must(db.commitments.find((item) => item.lotId === lot.id), "Commitment was not found.");
  const escrow = must(db.escrows.find((item) => item.commitmentId === commitment.id), "Escrow reference was not found.");
  const state = orderStateOf(db, lot.id);
  if (state === "SETTLED") {
    return {
      db: source,
      data: {
        alreadyReleased: true,
        settlements: db.settlements.filter((item) => item.commitmentId === commitment.id),
        payments: paymentsFor(source, commitment.id),
      },
      message: "Escrow release was already completed.",
    };
  }
  if (!["ACCEPTED", "ESCROW_RELEASE_REQUESTED", "ESCROW_RELEASED", "SETTLEMENT_PROCESSING"].includes(state)) {
    throw new AppError(
      "INVALID_STATE",
      "Escrow can be released only after the offtaker accepts the delivery.",
    );
  }
  const consignments = db.consignments.filter((item) => item.lotId === lot.id);
  if (consignments.some((item) => item.acceptedWeight === undefined)) {
    throw new AppError("INVALID_STATE", "Escrow cannot be released until every consignment has a confirmed weight.");
  }
  if (escrow.status !== "RELEASED") {
    const releaseKey = `escrow-release:${escrow.id}`;
    const firstRelease = claimIdempotency(db, ports, releaseKey, "ESCROW_RELEASE", escrow.id);
    if (firstRelease) {
      if (state === "ACCEPTED") setOrder(db, ports, user, lot.id, "ESCROW_RELEASE_REQUESTED", "ESCROW_RELEASE_REQUESTED");
      escrow.status = "RELEASE_REQUESTED";
      escrow.releaseRequestedAt = ports.now();
      escrow.releaseIdempotencyKey = releaseKey;
      let providerStatus;
      try {
        providerStatus = await ports.escrow.requestRelease({
          externalReference: escrow.externalReference,
          idempotencyKey: releaseKey,
        });
      } catch (error) {
        logEvent("error", "escrow_release_failed", { escrowId: escrow.id });
        throw error;
      }
      if (providerStatus.status !== "RELEASED") {
        throw new AppError("ESCROW_RELEASE_FAILED", "The external escrow provider has not confirmed release.");
      }
      escrow.status = "RELEASED";
      escrow.releasedAt = ports.now();
      setOrder(db, ports, user, lot.id, "ESCROW_RELEASED", "ESCROW_RELEASED", {
        externalReference: escrow.externalReference,
      });
    }
  }
  if (orderStateOf(db, lot.id) === "ESCROW_RELEASED") {
    setOrder(db, ports, user, lot.id, "SETTLEMENT_PROCESSING", "SETTLEMENT_PROCESSING");
  }
  const settlements: Settlement[] = [];
  const payments: Payment[] = [];
  for (const consignment of consignments) {
    const breakdown = breakdownFor(db, consignment.id);
    let settlement = db.settlements.find((item) => item.consignmentId === consignment.id);
    if (!settlement) {
      settlement = {
        id: ports.id("settlement"),
        consignmentId: consignment.id,
        farmerId: consignment.farmerId,
        commitmentId: commitment.id,
        grossValue: breakdown.grossValue,
        collectionFee: breakdown.collectionFee,
        otherDeductions: breakdown.otherDeductions,
        netSettlement: breakdown.netSettlement,
        feeCapped: breakdown.feeCapped,
        status: "PROCESSING",
        calculatedAt: ports.now(),
      };
      db.settlements.push(settlement);
      audit(db, ports, user, "SETTLEMENT_CALCULATED", "Settlement", settlement.id, undefined, "PROCESSING", {
        grossValue: settlement.grossValue,
        collectionFee: settlement.collectionFee,
        netSettlement: settlement.netSettlement,
        feeCapped: settlement.feeCapped,
      });
    }
    settlements.push(settlement);
    const payment = await paySettlement(db, ports, user.id, settlement);
    payments.push(payment);
  }
  const allPaid = payments.every((item) => item.status === "PAID");
  if (allPaid && orderStateOf(db, lot.id) === "SETTLEMENT_PROCESSING") {
    setOrder(db, ports, user, lot.id, "SETTLED", "SETTLED");
    lot.status = "CLOSED";
    for (const consignment of consignments) {
      consignment.status = "SETTLED";
      const listing = db.listings.find((item) => item.id === consignment.listingId);
      if (listing) {
        listing.status = "SETTLED";
        listing.updatedAt = ports.now();
      }
    }
    for (const settlement of settlements) {
      const farmerUser = userByFarmer(db, settlement.farmerId);
      const produce = db.produce.find((item) => item.id === consignments.find((row) => row.id === settlement.consignmentId)?.produceId);
      notify(
        db,
        ports,
        farmerUser.id,
        "Payment released",
        `${produce?.name ?? "Produce"} net settlement GHS ${settlement.netSettlement.toFixed(2)} is paid. Ref ${settlement.paymentReference}.`,
        "Settlement",
        settlement.id,
      );
      await sendSms(db, ports, {
        to: farmerUser.phone,
        userId: farmerUser.id,
        event: "payout_completed",
        idempotencyKey: `sms:payout:${settlement.id}`,
        body: `CryoChain paid GHS ${settlement.netSettlement.toFixed(2)} for ${produce?.name ?? "your produce"}. Gross ${settlement.grossValue.toFixed(2)} minus collection fee ${settlement.collectionFee.toFixed(2)}. Ref ${settlement.paymentReference}.`,
      });
    }
  } else if (!allPaid) {
    if (orderStateOf(db, lot.id) !== "EXCEPTION") {
      setOrder(db, ports, user, lot.id, "EXCEPTION", "PAYMENT_FAILED");
    }
    logEvent("error", "payment_failed", { lotId: lot.id });
  }
  return {
    db,
    data: { alreadyReleased: false, settlements, payments },
    message: allPaid ? "Escrow released and farmer payouts initiated." : "Escrow release started, but a payout needs attention.",
  };
}

async function paySettlement(db: AppDatabase, ports: Ports, userId: string, settlement: Settlement): Promise<Payment> {
  const user = actor(db, userId);
  const key = `payout:${settlement.id}`;
  const existing = db.payments.find((item) => item.idempotencyKey === key);
  if (existing) return existing;
  const farmerUser = userByFarmer(db, settlement.farmerId);
  const result = await ports.payment.initiatePayout({
    idempotencyKey: key,
    amountGhs: settlement.netSettlement,
    currency: "GHS",
    phone: farmerUser.phone,
    narration: `CryoChain settlement ${settlement.id}`,
    consignmentId: settlement.consignmentId,
    settlementId: settlement.id,
  });
  const payment: Payment = {
    id: ports.id("payment"),
    settlementId: settlement.id,
    consignmentId: settlement.consignmentId,
    provider: result.provider,
    amountGhs: settlement.netSettlement,
    currency: "GHS",
    status: result.status === "PAID" ? "PAID" : result.status === "FAILED" ? "FAILED" : "PROCESSING",
    externalReference: result.externalReference,
    idempotencyKey: key,
    createdAt: ports.now(),
    paidAt: result.status === "PAID" ? ports.now() : undefined,
    failureReason: result.failureReason,
  };
  db.payments.push(payment);
  settlement.status = payment.status === "PAID" ? "PAID" : payment.status === "FAILED" ? "FAILED" : "PROCESSING";
  settlement.paymentReference = payment.externalReference;
  if (payment.status === "PAID") settlement.paidAt = payment.paidAt;
  audit(db, ports, user, "PAYMENT", "Payment", payment.id, undefined, payment.status, {
    amountGhs: payment.amountGhs,
    externalReference: payment.externalReference,
  });
  if (payment.status === "FAILED") {
    db.exceptions.push({
      id: ports.id("exception"),
      type: "Payment failure",
      severity: "HIGH",
      entityType: "Payment",
      entityId: payment.id,
      description: payment.failureReason ?? "The payment provider did not complete the payout.",
      createdBy: user.id,
      status: "OPEN",
      createdAt: ports.now(),
    });
  }
  return payment;
}

function breakdownFor(db: AppDatabase, consignmentId: string) {
  const consignment = must(db.consignments.find((item) => item.id === consignmentId), "Consignment was not found.");
  const stop = db.stops.find((item) => item.id === consignment.collectionStopId && item.kind === "COLLECTION");
  const group = stop
    ? db.consignments.filter((item) => stop.consignmentIds.includes(item.id))
    : [consignment];
  const totalStopWeight = group.reduce((sum, item) => sum + (item.acceptedWeight ?? 0), 0);
  return calculateConsignmentSettlement({
    confirmedWeight: consignment.acceptedWeight ?? 0,
    pricePerUnit: consignment.agreedPricePerUnit,
    consignmentWeight: consignment.acceptedWeight ?? 0,
    totalStopWeight,
    stopCollectionFee: stop?.collectionFee ?? 0,
  });
}

function paymentsFor(db: AppDatabase, commitmentId: string): Payment[] {
  const settlementIds = new Set(db.settlements.filter((item) => item.commitmentId === commitmentId).map((item) => item.id));
  return db.payments.filter((item) => settlementIds.has(item.settlementId));
}

export { breakdownFor };
