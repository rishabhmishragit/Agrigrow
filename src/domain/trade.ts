import { AppError } from "./errors";
import { calculateEscrowInstruction } from "./economics";
import { logEvent } from "./logger";
import { roundGhs } from "./money";
import {
  actor,
  audit,
  begin,
  claimIdempotency,
  CommandResult,
  farmerForUser,
  notify,
  offtakerForUser,
  orderStateOf,
  Ports,
  requireRole,
  sendSms,
  setOrder,
  userByFarmer,
} from "./support";
import type {
  AppDatabase,
  Commitment,
  Consignment,
  Escrow,
  Lot,
  ProduceListing,
  StandingRequirement,
  User,
} from "./types";
import { must } from "./db";

export interface CreateListingInput {
  produceId: string;
  quantity: number;
  unit: string;
  availableDate: string;
  pickupLocation: string;
  latitude?: number;
  longitude?: number;
  notes?: string;
  status?: "DRAFT" | "AVAILABLE";
  farmerId?: string;
}

export async function createListing(
  source: AppDatabase,
  ports: Ports,
  userId: string,
  input: CreateListingInput,
): Promise<CommandResult<ProduceListing>> {
  const db = begin(source);
  const user = actor(db, userId);
  requireRole(
    user,
    ["farmer", "field_agent", "ops"],
    "You cannot create a produce listing.",
  );
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    throw new AppError("INVALID_AMOUNT", "Enter a quantity greater than zero.");
  }
  const produce = db.produce.find((item) => item.id === input.produceId);
  if (!produce) throw new AppError("NOT_FOUND", "Choose a produce type from the list.");
  const farmer =
    user.role === "farmer"
      ? farmerForUser(db, user.id)
      : must(
          db.farmerProfiles.find((item) => item.id === input.farmerId),
          "Choose the farmer this listing belongs to.",
        );
  const now = ports.now();
  const listing: ProduceListing = {
    id: ports.id("listing"),
    farmerId: farmer.id,
    produceId: produce.id,
    quantity: input.quantity,
    unit: input.unit || produce.defaultUnit,
    availableDate: input.availableDate,
    pickupLocation: input.pickupLocation,
    latitude: input.latitude,
    longitude: input.longitude,
    notes: input.notes,
    status: input.status ?? "AVAILABLE",
    createdAt: now,
    updatedAt: now,
  };
  db.listings.push(listing);
  audit(db, ports, user, "LISTING_CREATED", "ProduceListing", listing.id, undefined, listing.status);
  const farmerUser = userByFarmer(db, farmer.id);
  notify(
    db,
    ports,
    farmerUser.id,
    "Listing created",
    `${produce.name}, ${listing.quantity} ${listing.unit} is ${listing.status.toLowerCase()}.`,
    "ProduceListing",
    listing.id,
  );
  await sendSms(db, ports, {
    to: farmerUser.phone,
    userId: farmerUser.id,
    event: "listing_created",
    idempotencyKey: `sms:listing:${listing.id}`,
    body: `CryoChain: listing received for ${listing.quantity} ${listing.unit} ${produce.name}. Status: ${listing.status}.`,
  });
  return { db, data: listing };
}

export interface CreateLotInput {
  listingIds: string[];
  destination: string;
  pricePerUnit: number;
  collectionFee: number;
  otherCharges?: number;
  gradeExpectation: string;
  deliveryWindowStart: string;
  deliveryWindowEnd: string;
  origin?: string;
  publish: boolean;
  notes?: string;
}

export async function createLot(
  source: AppDatabase,
  ports: Ports,
  userId: string,
  input: CreateLotInput,
): Promise<CommandResult<{ lot: Lot; consignments: Consignment[] }>> {
  const db = begin(source);
  const user = actor(db, userId);
  requireRole(user, ["ops"], "Only operations can group listings into a lot.");
  if (input.listingIds.length === 0) {
    throw new AppError("INVALID_LOT", "Select at least one farmer listing.");
  }
  if (!Number.isFinite(input.pricePerUnit) || input.pricePerUnit <= 0) {
    throw new AppError("INVALID_AMOUNT", "Enter an agreed price greater than zero.");
  }
  if (!Number.isFinite(input.collectionFee) || input.collectionFee < 0) {
    throw new AppError("INVALID_AMOUNT", "Collection fee cannot be negative.");
  }
  const listings = input.listingIds.map((id) =>
    must(db.listings.find((item) => item.id === id), "One of the selected listings was not found."),
  );
  const produceIds = new Set(listings.map((item) => item.produceId));
  if (produceIds.size !== 1) {
    throw new AppError("INCOMPATIBLE_LISTINGS", "A lot can only group listings of the same produce.");
  }
  for (const listing of listings) {
    if (listing.status !== "AVAILABLE") {
      throw new AppError(
        "INVALID_STATE",
        "Only available listings can be grouped. One selected listing is already allocated.",
      );
    }
  }
  const now = ports.now();
  const produceId = listings[0].produceId;
  const lot: Lot = {
    id: ports.id("lot"),
    code: `LC-${2400 + db.lots.length + 1}`,
    produceId,
    origin: input.origin ?? listings[0].pickupLocation,
    destination: input.destination,
    gradeExpectation: input.gradeExpectation,
    pricePerUnit: roundGhs(input.pricePerUnit),
    collectionFeePerStop: roundGhs(input.collectionFee),
    otherCharges: roundGhs(input.otherCharges ?? 0),
    status: "DRAFT",
    orderState: "AGGREGATING",
    createdBy: user.id,
    notes: input.notes,
    deliveryWindowStart: input.deliveryWindowStart,
    deliveryWindowEnd: input.deliveryWindowEnd,
    createdAt: now,
  };
  db.lots.push(lot);
  audit(db, ports, user, "LOT_CREATED", "Lot", lot.id, undefined, "AGGREGATING");
  const consignments: Consignment[] = listings.map((listing) => {
    const consignment: Consignment = {
      id: ports.id("consignment"),
      lotId: lot.id,
      listingId: listing.id,
      farmerId: listing.farmerId,
      produceId: listing.produceId,
      expectedQuantity: listing.quantity,
      unit: listing.unit,
      agreedPricePerUnit: lot.pricePerUnit,
      bookingAccepted: false,
      status: "ALLOCATED",
    };
    db.consignments.push(consignment);
    listing.status = "ALLOCATED";
    listing.updatedAt = now;
    audit(db, ports, user, "LISTING_ALLOCATED", "ProduceListing", listing.id, "AVAILABLE", "ALLOCATED", {
      lotId: lot.id,
      consignmentId: consignment.id,
    });
    return consignment;
  });
  if (input.publish) {
    publish(db, ports, user, lot);
    const produce = must(db.produce.find((item) => item.id === produceId), "Produce was not found.");
    for (const offtaker of db.offtakerProfiles) {
      notify(
        db,
        ports,
        offtaker.userId,
        "Lot available",
        `${lot.code}: ${produce.name} is ready for commitment.`,
        "Lot",
        lot.id,
      );
    }
  }
  return { db, data: { lot, consignments } };
}

function publish(db: AppDatabase, ports: Ports, user: User, lot: Lot): void {
  if (lot.orderState === "AGGREGATING") {
    setOrder(db, ports, user, lot.id, "LOT_CREATED", "LOT_PUBLISHED");
  }
  lot.status = "PUBLISHED";
  lot.publishedAt = ports.now();
}

export async function publishLot(
  source: AppDatabase,
  ports: Ports,
  userId: string,
  lotId: string,
): Promise<CommandResult<Lot>> {
  const db = begin(source);
  const user = actor(db, userId);
  requireRole(user, ["ops"], "Only operations can publish a lot.");
  const lot = must(db.lots.find((item) => item.id === lotId), "Lot was not found.");
  if (db.consignments.filter((item) => item.lotId === lot.id).length === 0) {
    throw new AppError("INVALID_LOT", "A lot must contain one or more consignments.");
  }
  publish(db, ports, user, lot);
  return { db, data: lot };
}

export async function commitToLot(
  source: AppDatabase,
  ports: Ports,
  userId: string,
  lotId: string,
): Promise<CommandResult<Commitment>> {
  const db = begin(source);
  const user = actor(db, userId);
  requireRole(user, ["offtaker"], "Only an offtaker can commit to a lot.");
  const offtaker = offtakerForUser(db, user.id);
  const lot = must(db.lots.find((item) => item.id === lotId), "Lot was not found.");
  if (lot.status !== "PUBLISHED" || lot.orderState !== "LOT_CREATED") {
    throw new AppError("INVALID_STATE", "This lot is not open for commitment.");
  }
  if (db.commitments.some((item) => item.lotId === lot.id)) {
    throw new AppError("CONFLICT", "This lot already has a commitment.");
  }
  const commitment: Commitment = {
    id: ports.id("commitment"),
    lotId: lot.id,
    offtakerId: offtaker.id,
    orderState: lot.orderState,
    createdAt: ports.now(),
  };
  db.commitments.push(commitment);
  lot.status = "COMMITTED";
  setOrder(db, ports, user, lot.id, "COMMITTED", "COMMITMENT_CREATED");
  notify(db, ports, user.id, "Commitment created", `${lot.code} is committed. Fund escrow to authorise collection.`, "Commitment", commitment.id);
  return { db, data: commitment };
}

export async function initiateEscrow(
  source: AppDatabase,
  ports: Ports,
  userId: string,
  commitmentId: string,
): Promise<CommandResult<Escrow>> {
  const db = begin(source);
  const user = actor(db, userId);
  requireRole(user, ["offtaker", "ops"], "You cannot open an escrow instruction.");
  const commitment = must(db.commitments.find((item) => item.id === commitmentId), "Commitment was not found.");
  if (user.role === "offtaker" && offtakerForUser(db, user.id).id !== commitment.offtakerId) {
    throw new AppError("FORBIDDEN", "You can only fund escrow for your own commitment.");
  }
  if (orderStateOf(db, commitment.lotId) !== "COMMITTED") {
    throw new AppError("INVALID_STATE", "Escrow can only be opened from a new commitment.");
  }
  const existing = db.escrows.find((item) => item.commitmentId === commitment.id);
  if (existing) return { db: source, data: existing, message: "Escrow instruction already exists." };
  const lot = must(db.lots.find((item) => item.id === commitment.lotId), "Lot was not found.");
  const consignments = db.consignments.filter((item) => item.lotId === lot.id);
  const instruction = calculateEscrowInstruction({
    grossValues: consignments.map((item) => roundGhs(item.expectedQuantity * item.agreedPricePerUnit)),
    stopCollectionFees: [lot.collectionFeePerStop],
    otherCharges: lot.otherCharges,
  });
  const providerStatus = await ports.escrow.createEscrowReference({
    commitmentId: commitment.id,
    instructedAmountGhs: instruction.totalEscrowRequirement,
    currency: "GHS",
    bankLabel: ports.escrowBankLabel,
    idempotencyKey: `escrow-open:${commitment.id}`,
  });
  const escrow: Escrow = {
    id: ports.id("escrow"),
    commitmentId: commitment.id,
    provider: providerStatus.provider,
    bankLabel: ports.escrowBankLabel,
    externalReference: providerStatus.externalReference,
    status: "PENDING",
    instructedAmountGhs: instruction.totalEscrowRequirement,
    createdAt: ports.now(),
  };
  db.escrows.push(escrow);
  setOrder(db, ports, user, lot.id, "ESCROW_PENDING", "ESCROW_INSTRUCTION_CREATED", {
    externalReference: escrow.externalReference,
    instructedAmountGhs: escrow.instructedAmountGhs,
  });
  notify(
    db,
    ports,
    user.id,
    "Escrow pending",
    `Transfer ${escrow.instructedAmountGhs.toFixed(2)} GHS to the external trust account. Reference ${escrow.externalReference}.`,
    "Escrow",
    escrow.id,
  );
  return { db, data: escrow };
}

export async function confirmEscrowFunding(
  source: AppDatabase,
  ports: Ports,
  userId: string,
  escrowId: string,
): Promise<CommandResult<Escrow>> {
  const db = begin(source);
  const user = actor(db, userId);
  requireRole(user, ["offtaker", "ops"], "You cannot confirm escrow funding.");
  const escrow = must(db.escrows.find((item) => item.id === escrowId), "Escrow was not found.");
  const commitment = must(
    db.commitments.find((item) => item.id === escrow.commitmentId),
    "Commitment was not found.",
  );
  if (user.role === "offtaker" && offtakerForUser(db, user.id).id !== commitment.offtakerId) {
    throw new AppError("FORBIDDEN", "You can only confirm funding for your own order.");
  }
  if (escrow.status === "FUNDED") {
    return { db: source, data: escrow, message: "Escrow funding was already confirmed." };
  }
  const providerStatus = await ports.escrow.verifyFunding(escrow.externalReference);
  if (providerStatus.status !== "FUNDED") {
    throw new AppError(
      "ESCROW_NOT_FUNDED",
      "The external escrow provider has not confirmed funding yet.",
    );
  }
  const key = `escrow-fund:${escrow.id}:${providerStatus.externalTransactionRef ?? "funded"}`;
  if (!claimIdempotency(db, ports, key, "ESCROW_FUNDING", escrow.id)) {
    return { db: source, data: escrow, message: "Escrow funding was already confirmed." };
  }
  escrow.status = "FUNDED";
  escrow.fundedAt = ports.now();
  escrow.externalTransactionRef = providerStatus.externalTransactionRef;
  setOrder(db, ports, user, commitment.lotId, "ESCROW_FUNDED", "ESCROW_FUNDING_CONFIRMED", {
    externalReference: escrow.externalReference,
    externalTransactionRef: escrow.externalTransactionRef,
  });
  notify(db, ports, user.id, "Escrow funded", `External escrow ${escrow.externalReference} is funded. Collection can now be scheduled.`, "Escrow", escrow.id);
  const opsUsers = db.users.filter((item) => item.role === "ops");
  for (const ops of opsUsers) {
    notify(db, ports, ops.id, "Escrow funded", `${escrow.externalReference} is funded and waiting for dispatch.`, "Escrow", escrow.id);
  }
  return { db, data: escrow };
}

export interface ScheduleCollectionInput {
  lotId: string;
  fieldAgentId: string;
  driverId: string;
  vehicleId: string;
  scheduledDate: string;
  windowLabel: string;
  stopLocation?: string;
  latitude?: number;
  longitude?: number;
}

export async function scheduleCollection(
  source: AppDatabase,
  ports: Ports,
  userId: string,
  input: ScheduleCollectionInput,
): Promise<CommandResult<{ collectionId: string; manifestId: string }>> {
  const db = begin(source);
  const user = actor(db, userId);
  requireRole(user, ["ops"], "Only operations can schedule a collection.");
  const lot = must(db.lots.find((item) => item.id === input.lotId), "Lot was not found.");
  const commitment = must(
    db.commitments.find((item) => item.lotId === lot.id),
    "This lot has no commitment.",
  );
  const escrow = db.escrows.find((item) => item.commitmentId === commitment.id);
  if (orderStateOf(db, lot.id) !== "ESCROW_FUNDED" || escrow?.status !== "FUNDED") {
    throw new AppError(
      "ESCROW_NOT_FUNDED",
      "Collection cannot begin because escrow funding has not been confirmed.",
    );
  }
  if (db.collections.some((item) => item.lotId === lot.id)) {
    throw new AppError("CONFLICT", "A collection is already scheduled for this lot.");
  }
  if (!db.fieldAgentProfiles.some((item) => item.id === input.fieldAgentId)) {
    throw new AppError("NOT_FOUND", "Field agent was not found.");
  }
  if (!db.driverProfiles.some((item) => item.id === input.driverId)) {
    throw new AppError("NOT_FOUND", "Driver was not found.");
  }
  if (!db.vehicles.some((item) => item.id === input.vehicleId)) {
    throw new AppError("NOT_FOUND", "Vehicle was not found.");
  }
  const consignments = db.consignments.filter((item) => item.lotId === lot.id);
  if (consignments.length === 0) {
    throw new AppError("INVALID_LOT", "A lot must contain one or more consignments.");
  }
  const collectionId = ports.id("collection");
  const manifestId = ports.id("manifest");
  const collectionStopId = ports.id("stop");
  const deliveryStopId = ports.id("stop");
  const deliveryId = ports.id("delivery");
  db.collections.push({
    id: collectionId,
    lotId: lot.id,
    commitmentId: commitment.id,
    fieldAgentId: input.fieldAgentId,
    scheduledDate: input.scheduledDate,
    windowLabel: input.windowLabel,
    status: "SCHEDULED",
  });
  db.manifests.push({
    id: manifestId,
    code: `MF-${String(db.manifests.length + 1).padStart(4, "0")}`,
    driverId: input.driverId,
    vehicleId: input.vehicleId,
    date: input.scheduledDate,
    routeLabel: `${lot.origin} to ${lot.destination}`,
    destination: lot.destination,
    status: "ASSIGNED",
    commitmentIds: [commitment.id],
    lotIds: [lot.id],
  });
  db.stops.push({
    id: collectionStopId,
    kind: "COLLECTION",
    collectionId,
    manifestId,
    lotId: lot.id,
    location: input.stopLocation ?? lot.origin,
    latitude: input.latitude,
    longitude: input.longitude,
    windowLabel: input.windowLabel,
    collectionFee: lot.collectionFeePerStop,
    consignmentIds: consignments.map((item) => item.id),
    status: "PENDING",
    sequence: 1,
  });
  db.deliveries.push({
    id: deliveryId,
    commitmentId: commitment.id,
    lotId: lot.id,
    manifestId,
    stopId: deliveryStopId,
    location: lot.destination,
    status: "PENDING",
    syncStatus: "SYNCED",
  });
  db.stops.push({
    id: deliveryStopId,
    kind: "DELIVERY",
    manifestId,
    lotId: lot.id,
    location: lot.destination,
    windowLabel: `${lot.deliveryWindowStart} to ${lot.deliveryWindowEnd}`,
    collectionFee: 0,
    consignmentIds: consignments.map((item) => item.id),
    status: "PENDING",
    sequence: 2,
  });
  for (const consignment of consignments) {
    consignment.collectionStopId = collectionStopId;
    consignment.status = "SCHEDULED";
    const listing = db.listings.find((item) => item.id === consignment.listingId);
    if (listing) {
      listing.status = "SCHEDULED";
      listing.updatedAt = ports.now();
    }
  }
  const driver = must(db.driverProfiles.find((item) => item.id === input.driverId), "Driver was not found.");
  const agent = must(db.fieldAgentProfiles.find((item) => item.id === input.fieldAgentId), "Agent was not found.");
  setOrder(db, ports, user, lot.id, "COLLECTION_SCHEDULED", "COLLECTION_SCHEDULED", {
    collectionId,
    manifestId,
  });
  notify(db, ports, agent.userId, "Assignment", `Collection ${lot.code} is assigned to you.`, "Collection", collectionId);
  notify(db, ports, driver.userId, "Manifest assigned", `Route ${lot.origin} to ${lot.destination} is on your manifest.`, "Manifest", manifestId);
  const offtaker = must(db.offtakerProfiles.find((item) => item.id === commitment.offtakerId), "Offtaker was not found.");
  notify(db, ports, offtaker.userId, "Collection scheduled", `${lot.code} collection is scheduled.`, "Lot", lot.id);
  for (const consignment of consignments) {
    const farmerUser = userByFarmer(db, consignment.farmerId);
    notify(
      db,
      ports,
      farmerUser.id,
      "Collection scheduled",
      `Pickup ${input.scheduledDate}, ${input.windowLabel}, at ${input.stopLocation ?? lot.origin}.`,
      "Collection",
      collectionId,
    );
    await sendSms(db, ports, {
      to: farmerUser.phone,
      userId: farmerUser.id,
      event: "collection_scheduled",
      idempotencyKey: `sms:collection:${collectionId}:${consignment.id}`,
      body: `CryoChain: pickup scheduled ${input.scheduledDate} (${input.windowLabel}) at ${input.stopLocation ?? lot.origin} for ${consignment.expectedQuantity} ${consignment.unit}.`,
    });
  }
  return { db, data: { collectionId, manifestId } };
}

export async function acceptCollectionBooking(
  source: AppDatabase,
  ports: Ports,
  userId: string,
  consignmentId: string,
): Promise<CommandResult<Consignment>> {
  const db = begin(source);
  const user = actor(db, userId);
  requireRole(user, ["farmer"], "Only the farmer can accept a collection booking.");
  const farmer = farmerForUser(db, user.id);
  const consignment = must(db.consignments.find((item) => item.id === consignmentId), "Consignment was not found.");
  if (consignment.farmerId !== farmer.id) {
    throw new AppError("FORBIDDEN", "You can only accept a booking for your own consignment.");
  }
  consignment.bookingAccepted = true;
  audit(db, ports, user, "BOOKING_ACCEPTED", "Consignment", consignment.id, "false", "true");
  return { db, data: consignment };
}

export interface RequirementInput {
  produceId: string;
  quantity: number;
  unit: string;
  gradeRequirement: string;
  deliveryLocation: string;
  deliveryWindowStart: string;
  deliveryWindowEnd: string;
  temperatureMinC?: number;
  temperatureMaxC?: number;
  notes?: string;
  status?: "DRAFT" | "ACTIVE";
}

export async function createRequirement(
  source: AppDatabase,
  ports: Ports,
  userId: string,
  input: RequirementInput,
): Promise<CommandResult<StandingRequirement>> {
  const db = begin(source);
  const user = actor(db, userId);
  requireRole(user, ["offtaker"], "Only an offtaker can post a standing requirement.");
  const offtaker = offtakerForUser(db, user.id);
  if (!db.produce.some((item) => item.id === input.produceId)) {
    throw new AppError("NOT_FOUND", "Choose a produce type from the list.");
  }
  const requirement: StandingRequirement = {
    id: ports.id("requirement"),
    offtakerId: offtaker.id,
    produceId: input.produceId,
    quantity: input.quantity,
    unit: input.unit,
    gradeRequirement: input.gradeRequirement,
    deliveryLocation: input.deliveryLocation,
    deliveryWindowStart: input.deliveryWindowStart,
    deliveryWindowEnd: input.deliveryWindowEnd,
    temperatureMinC: input.temperatureMinC,
    temperatureMaxC: input.temperatureMaxC,
    notes: input.notes,
    status: input.status ?? "ACTIVE",
    createdAt: ports.now(),
  };
  db.standingRequirements.push(requirement);
  audit(db, ports, user, "REQUIREMENT_CREATED", "StandingRequirement", requirement.id, undefined, requirement.status);
  return { db, data: requirement };
}

export async function registerFarmer(
  source: AppDatabase,
  ports: Ports,
  userId: string,
  input: {
    fullName: string;
    phone: string;
    village: string;
    community: string;
    location: string;
    produceIds: string[];
    farmInfo?: string;
    latitude?: number;
    longitude?: number;
  },
): Promise<CommandResult<{ userId: string; farmerId: string }>> {
  const db = begin(source);
  const user = actor(db, userId);
  requireRole(user, ["field_agent", "ops", "farmer"], "You cannot register a farmer.");
  const phone = input.phone.trim();
  if (db.users.some((item) => item.phone === phone)) {
    throw new AppError("CONFLICT", "A user with this phone number already exists.");
  }
  const now = ports.now();
  const createdUserId = ports.id("user");
  const farmerId = ports.id("farmer");
  db.users.push({
    id: createdUserId,
    role: "farmer",
    fullName: input.fullName.trim(),
    phone,
    email: `${createdUserId}@farmers.cryochain.local`,
    location: input.location,
    active: true,
    createdAt: now,
  });
  db.farmerProfiles.push({
    id: farmerId,
    userId: createdUserId,
    village: input.village,
    community: input.community,
    farmInfo: input.farmInfo,
    produceIds: input.produceIds,
    phoneVerified: false,
    locationLabel: input.location,
    latitude: input.latitude,
    longitude: input.longitude,
  });
  audit(db, ports, user, "FARMER_REGISTERED", "FarmerProfile", farmerId, undefined, "active");
  await sendSms(db, ports, {
    to: phone,
    userId: createdUserId,
    event: "registration",
    idempotencyKey: `sms:register:${farmerId}`,
    body: `CryoChain: ${input.fullName}, you are registered in ${input.village}. Verify this phone to list produce.`,
  });
  return { db, data: { userId: createdUserId, farmerId } };
}

export async function requestPhoneOtp(
  source: AppDatabase,
  ports: Ports,
  phone: string,
  code: string,
): Promise<CommandResult<{ phone: string }>> {
  const db = begin(source);
  const user = db.users.find((item) => item.phone === phone && item.active);
  if (!user) throw new AppError("NOT_FOUND", "No CryoChain account uses that phone number.");
  const expires = new Date(new Date(ports.now()).getTime() + 10 * 60 * 1000).toISOString();
  db.otpChallenges.push({
    id: ports.id("otp"),
    phone,
    code,
    expiresAt: expires,
    consumed: false,
  });
  await sendSms(db, ports, {
    to: phone,
    userId: user.id,
    event: "otp",
    idempotencyKey: `sms:otp:${phone}:${ports.now()}`,
    body: `CryoChain code: ${code}. It expires in 10 minutes.`,
  });
  return { db, data: { phone } };
}

export function verifyPhoneOtp(
  source: AppDatabase,
  ports: Ports,
  phone: string,
  code: string,
): CommandResult<User> {
  const db = begin(source);
  const challenge = [...db.otpChallenges]
    .reverse()
    .find((item) => item.phone === phone && !item.consumed);
  if (!challenge || challenge.code !== code || challenge.expiresAt < ports.now()) {
    logEvent("warn", "authentication_failed", { reason: "otp" });
    throw new AppError("UNAUTHENTICATED", "That code is not valid. Request a new one.");
  }
  challenge.consumed = true;
  const user = must(db.users.find((item) => item.phone === phone && item.active), "Account was not found.");
  const farmer = db.farmerProfiles.find((item) => item.userId === user.id);
  if (farmer) farmer.phoneVerified = true;
  audit(db, ports, user, "LOGIN", "User", user.id, undefined, user.role);
  return { db, data: user };
}

export function authenticateDemo(
  source: AppDatabase,
  ports: Ports,
  email: string,
  password: string,
  expectedPassword: string,
  demoEnabled: boolean,
): CommandResult<User> {
  if (!demoEnabled) {
    throw new AppError(
      "UNAUTHENTICATED",
      "Demo sign-in is disabled. Use the configured authentication provider.",
    );
  }
  const db = begin(source);
  const user = db.users.find((item) => item.email.toLowerCase() === email.trim().toLowerCase() && item.active);
  if (!user || password !== expectedPassword) {
    logEvent("warn", "authentication_failed", { reason: "demo_credentials" });
    throw new AppError("UNAUTHENTICATED", "Email or password is not recognised.");
  }
  audit(db, ports, user, "LOGIN", "User", user.id, undefined, user.role);
  return { db, data: user };
}

export async function raiseException(
  source: AppDatabase,
  ports: Ports,
  userId: string,
  input: {
    type: string;
    severity: "LOW" | "MEDIUM" | "HIGH";
    entityType: string;
    entityId: string;
    description: string;
    lotId?: string;
    assignedTo?: string;
  },
): Promise<CommandResult<{ exceptionId: string }>> {
  const db = begin(source);
  const user = actor(db, userId);
  requireRole(user, ["ops", "field_agent", "driver", "offtaker"], "You cannot raise an exception.");
  const exceptionId = ports.id("exception");
  db.exceptions.push({
    id: exceptionId,
    type: input.type,
    severity: input.severity,
    entityType: input.entityType,
    entityId: input.entityId,
    description: input.description,
    createdBy: user.id,
    assignedTo: input.assignedTo,
    status: input.assignedTo ? "ASSIGNED" : "OPEN",
    createdAt: ports.now(),
  });
  if (input.lotId) {
    const state = orderStateOf(db, input.lotId);
    if (state !== "EXCEPTION" && state !== "SETTLED" && state !== "CANCELLED") {
      setOrder(db, ports, user, input.lotId, "EXCEPTION", "EXCEPTION_OPENED", { exceptionId, type: input.type });
    }
  }
  audit(db, ports, user, "EXCEPTION_OPENED", input.entityType, input.entityId, undefined, "OPEN", {
    exceptionId,
    type: input.type,
  });
  for (const ops of db.users.filter((item) => item.role === "ops")) {
    notify(db, ports, ops.id, "Exception", `${input.type}: ${input.description}`, input.entityType, input.entityId);
  }
  return { db, data: { exceptionId } };
}

export function updateException(
  source: AppDatabase,
  ports: Ports,
  userId: string,
  input: {
    exceptionId: string;
    status: "ASSIGNED" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
    resolution?: string;
    assignedTo?: string;
    resumeLot?: boolean;
  },
): CommandResult<{ exceptionId: string }> {
  const db = begin(source);
  const user = actor(db, userId);
  requireRole(user, ["ops"], "Only operations can update an exception.");
  const exception = must(db.exceptions.find((item) => item.id === input.exceptionId), "Exception was not found.");
  const previous = exception.status;
  exception.status = input.status;
  if (input.assignedTo) exception.assignedTo = input.assignedTo;
  if (input.resolution) exception.resolution = input.resolution;
  if (input.status === "RESOLVED" || input.status === "CLOSED") {
    exception.resolvedAt = ports.now();
  }
  audit(db, ports, user, "EXCEPTION_UPDATED", "Exception", exception.id, previous, input.status);
  if (input.resumeLot) {
    const lot = db.lots.find((item) => item.id === exception.entityId || item.orderState === "EXCEPTION");
    const target = db.lots.find((item) => item.stateBeforeException && item.orderState === "EXCEPTION" && (item.id === exception.entityId || exception.entityType === "Lot"));
    if (target?.stateBeforeException) {
      target.orderState = target.stateBeforeException;
      const commitment = db.commitments.find((item) => item.lotId === target.id);
      if (commitment) commitment.orderState = target.orderState;
      audit(db, ports, user, "EXCEPTION_RESUMED", "Lot", target.id, "EXCEPTION", target.orderState);
    } else if (lot && input.status === "RESOLVED") {
      void lot;
    }
  }
  return { db, data: { exceptionId: exception.id } };
}

export function markNotificationRead(
  source: AppDatabase,
  ports: Ports,
  userId: string,
  notificationId: string,
): CommandResult<{ id: string }> {
  const db = begin(source);
  const user = actor(db, userId);
  const notification = must(db.notifications.find((item) => item.id === notificationId), "Notification was not found.");
  if (notification.userId !== user.id && user.role !== "ops") {
    throw new AppError("FORBIDDEN", "You cannot change another person's notification.");
  }
  notification.read = true;
  void ports;
  return { db, data: { id: notification.id } };
}

export async function selfRegisterFarmer(
  source: AppDatabase,
  ports: Ports,
  input: { fullName: string; phone: string; village: string; produceName: string },
): Promise<CommandResult<{ userId: string; farmerId: string }>> {
  const db = begin(source);
  if (db.users.some((item) => item.phone === input.phone)) {
    const existing = must(db.users.find((item) => item.phone === input.phone), "Farmer was not found.");
    const profile = must(db.farmerProfiles.find((item) => item.userId === existing.id), "Farmer profile was not found.");
    return { db: source, data: { userId: existing.id, farmerId: profile.id }, message: "You are already registered." };
  }
  const produce = db.produce.find((item) => item.name.toLowerCase() === input.produceName.trim().toLowerCase()) ?? db.produce[0];
  const now = ports.now();
  const userId = ports.id("user");
  const farmerId = ports.id("farmer");
  db.users.push({
    id: userId,
    role: "farmer",
    fullName: input.fullName.trim(),
    phone: input.phone,
    email: `${userId}@farmers.cryochain.local`,
    location: input.village,
    active: true,
    createdAt: now,
  });
  db.farmerProfiles.push({
    id: farmerId,
    userId,
    village: input.village,
    community: input.village,
    produceIds: produce ? [produce.id] : [],
    phoneVerified: true,
    locationLabel: input.village,
  });
  const created = must(db.users.find((item) => item.id === userId), "Farmer was not created.");
  audit(db, ports, created, "FARMER_REGISTERED", "FarmerProfile", farmerId, undefined, "active", { channel: "ussd" });
  await sendSms(db, ports, {
    to: input.phone,
    userId,
    event: "registration",
    idempotencyKey: `sms:register:${farmerId}`,
    body: `CryoChain: ${input.fullName}, you are registered in ${input.village}.`,
  });
  return { db, data: { userId, farmerId } };
}