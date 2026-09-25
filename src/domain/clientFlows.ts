import { must } from "./db";
import { AppError } from "./errors";
import { roundGhs } from "./money";
import { actor, audit, begin, CommandResult, offtakerForUser, Ports, requireRole } from "./support";
import type { AppDatabase, BuyerOrder, OpsConfig, PayoutRun } from "./types";

const DECLINE_REASONS = ["Quality", "Weight short", "Farmer no show", "Wrong produce", "Farmer declined price"] as const;
export { DECLINE_REASONS };

export async function placeBuyerOrder(
  source: AppDatabase,
  ports: Ports,
  userId: string,
  input: { produceId: string; quantityKg: number; deliveryDate: string },
): Promise<CommandResult<BuyerOrder>> {
  const db = begin(source);
  const user = actor(db, userId);
  requireRole(user, ["offtaker"], "Only a buyer can place an order.");
  const profile = offtakerForUser(db, user.id);
  const produce = must(db.produce.find((item) => item.id === input.produceId), "Choose a product.");
  if (!Number.isFinite(input.quantityKg) || input.quantityKg <= 0) {
    throw new AppError("INVALID_AMOUNT", "Enter the kilograms you need.");
  }
  if (!input.deliveryDate) throw new AppError("INVALID_STATE", "Choose a delivery date.");
  const price = produce.pricePerKg ?? 0;
  const order: BuyerOrder = {
    id: ports.id("order"),
    offtakerId: profile.id,
    produceId: produce.id,
    quantityKg: input.quantityKg,
    deliveryDate: input.deliveryDate,
    pricePerKg: price,
    totalGhs: roundGhs(input.quantityKg * price),
    orderStatus: "AWAITING_PAYMENT",
    paymentStatus: "UNPAID",
    submittedBy: user.id,
    createdAt: ports.now(),
  };
  db.buyerOrders.push(order);
  audit(db, ports, user, "ORDER_SUBMITTED", "BuyerOrder", order.id, undefined, order.orderStatus);
  return { db, data: order, message: "Order submitted. An approver pays CryoChain in full before collection." };
}

export async function payBuyerOrder(
  source: AppDatabase,
  ports: Ports,
  userId: string,
  orderId: string,
): Promise<CommandResult<BuyerOrder>> {
  const db = begin(source);
  const user = actor(db, userId);
  requireRole(user, ["offtaker"], "Only a buyer can pay an order.");
  const profile = offtakerForUser(db, user.id);
  const order = must(db.buyerOrders.find((item) => item.id === orderId && item.offtakerId === profile.id), "Order was not found.");
  if (order.paymentStatus === "PAID") return { db: source, data: order, message: "This order is already paid." };
  const seat = profile.buyerSeat ?? "admin";
  if (seat === "requester") throw new AppError("FORBIDDEN", "A requester can submit an order. An approver pays it.");
  if (seat === "approver" && order.totalGhs > (profile.paymentLimitGhs ?? 0)) {
    throw new AppError("FORBIDDEN", `This order is above your payment limit of GHS ${(profile.paymentLimitGhs ?? 0).toFixed(2)}.`);
  }
  order.paymentStatus = "PAID";
  order.orderStatus = "PAID";
  order.paidBy = user.id;
  audit(db, ports, user, "ORDER_PAID", "BuyerOrder", order.id, "AWAITING_PAYMENT", "PAID");
  return { db, data: order, message: "Paid in full to CryoChain. Collection can be planned." };
}

export async function reorder(
  source: AppDatabase,
  ports: Ports,
  userId: string,
  orderId: string,
): Promise<CommandResult<BuyerOrder>> {
  const db = begin(source);
  const user = actor(db, userId);
  const profile = offtakerForUser(db, user.id);
  const previous = must(db.buyerOrders.find((item) => item.id === orderId && item.offtakerId === profile.id), "Order was not found.");
  return placeBuyerOrder(db, ports, userId, {
    produceId: previous.produceId,
    quantityKg: previous.quantityKg,
    deliveryDate: previous.deliveryDate,
  });
}

export async function setBuyerSeat(
  source: AppDatabase,
  ports: Ports,
  userId: string,
  input: { profileId: string; seat: "requester" | "approver" | "admin"; paymentLimitGhs?: number },
): Promise<CommandResult<{ profileId: string }>> {
  const db = begin(source);
  const user = actor(db, userId);
  const actorProfile = offtakerForUser(db, user.id);
  if ((actorProfile.buyerSeat ?? "admin") !== "admin") {
    throw new AppError("FORBIDDEN", "Only a buyer admin can manage users.");
  }
  const target = must(db.offtakerProfiles.find((item) => item.id === input.profileId), "Buyer was not found.");
  target.buyerSeat = input.seat;
  if (input.paymentLimitGhs !== undefined) target.paymentLimitGhs = input.paymentLimitGhs;
  audit(db, ports, user, "BUYER_SEAT", "OfftakerProfile", target.id, undefined, input.seat);
  return { db, data: { profileId: target.id } };
}

export async function allocateBuyerOrder(
  source: AppDatabase,
  ports: Ports,
  userId: string,
  input: { orderId: string; splits: Array<{ farmerId: string; kg: number; pricePerKg: number }> },
): Promise<CommandResult<{ lotId: string }>> {
  const db = begin(source);
  const user = actor(db, userId);
  requireRole(user, ["ops"], "Only operations can allocate an order.");
  const order = must(db.buyerOrders.find((item) => item.id === input.orderId), "Order was not found.");
  if (order.paymentStatus !== "PAID") throw new AppError("INVALID_STATE", "Allocate only orders that are paid in full.");
  const total = input.splits.reduce((sum, item) => sum + item.kg, 0);
  if (Math.abs(total - order.quantityKg) > 0.05) {
    throw new AppError("INVALID_AMOUNT", `Allocated ${total} kg. The order is ${order.quantityKg} kg.`);
  }
  const lotId = order.lotId ?? ports.id("lot");
  if (order.lotId) {
    db.consignments = db.consignments.filter((item) => item.lotId !== order.lotId);
  }
  if (!order.lotId) {
    db.lots.push({
      id: lotId,
      code: `ORD-${db.lots.length + 1}`,
      produceId: order.produceId,
      origin: "Allocated",
      destination: db.offtakerProfiles.find((item) => item.id === order.offtakerId)?.deliveryLocation ?? "Buyer",
      gradeExpectation: "Product scale",
      pricePerUnit: order.pricePerKg,
      collectionFeePerStop: 0,
      otherCharges: 0,
      status: "COMMITTED",
      orderState: "ESCROW_FUNDED",
      createdBy: user.id,
      deliveryWindowStart: order.deliveryDate,
      deliveryWindowEnd: order.deliveryDate,
      createdAt: ports.now(),
    });
    order.lotId = lotId;
  }
  for (const split of input.splits) {
    const listingId = ports.id("listing");
    db.listings.push({
      id: listingId,
      farmerId: split.farmerId,
      produceId: order.produceId,
      quantity: split.kg,
      unit: "kg",
      availableDate: order.deliveryDate,
      pickupLocation: db.farmerProfiles.find((item) => item.id === split.farmerId)?.locationLabel ?? "Farm gate",
      status: "ALLOCATED",
      createdAt: ports.now(),
      updatedAt: ports.now(),
    });
    db.consignments.push({
      id: ports.id("consignment"),
      lotId,
      listingId,
      farmerId: split.farmerId,
      produceId: order.produceId,
      expectedQuantity: split.kg,
      unit: "kg",
      agreedPricePerUnit: split.pricePerKg,
      bookingAccepted: false,
      status: "ALLOCATED",
    });
  }
  order.orderStatus = "ALLOCATED";
  audit(db, ports, user, "ORDER_ALLOCATED", "BuyerOrder", order.id, "PAID", "ALLOCATED");
  return { db, data: { lotId }, message: "Order allocated across consignments." };
}

export async function recutConsignment(
  source: AppDatabase,
  ports: Ports,
  userId: string,
  input: { consignmentId: string; kg: number },
): Promise<CommandResult<{ consignmentId: string }>> {
  const db = begin(source);
  const user = actor(db, userId);
  requireRole(user, ["ops"], "Only operations can re-cut a consignment.");
  const consignment = must(db.consignments.find((item) => item.id === input.consignmentId), "Consignment was not found.");
  if (input.kg <= 0 || input.kg >= consignment.expectedQuantity) {
    throw new AppError("INVALID_AMOUNT", "Enter a smaller weight for the short consignment.");
  }
  const shortfall = roundGhs(consignment.expectedQuantity - input.kg);
  consignment.expectedQuantity = input.kg;
  db.exceptions.push({
    id: ports.id("exception"),
    type: "Consignment short",
    severity: "MEDIUM",
    entityType: "Consignment",
    entityId: consignment.id,
    description: `Consignment re-cut. ${shortfall} kg still needs a farmer.`,
    createdBy: user.id,
    status: "OPEN",
    createdAt: ports.now(),
  });
  return { db, data: { consignmentId: consignment.id }, message: "Consignment re-cut. The shortfall stays on the order." };
}

export async function createPayoutRun(
  source: AppDatabase,
  ports: Ports,
  userId: string,
  settlementIds: string[],
): Promise<CommandResult<PayoutRun>> {
  const db = begin(source);
  const user = actor(db, userId);
  requireRole(user, ["ops"], "Only operations can create a payout run.");
  const rows = settlementIds.map((id) => must(db.settlements.find((item) => item.id === id), "Settlement was not found."));
  const total = roundGhs(rows.reduce((sum, item) => sum + item.netSettlement, 0));
  const due = new Date(new Date(ports.now()).getTime() + 24 * 60 * 60 * 1000).toISOString();
  const run: PayoutRun = {
    id: ports.id("run"),
    settlementIds,
    raisedBy: user.id,
    approvals: [],
    status: "PENDING_APPROVAL",
    totalGhs: total,
    createdAt: ports.now(),
    dueAt: due,
  };
  db.payoutRuns.push(run);
  audit(db, ports, user, "PAYOUT_RUN", "PayoutRun", run.id, undefined, run.status);
  return { db, data: run, message: "Payout run created. A different person must approve it." };
}

export async function approvePayoutRun(
  source: AppDatabase,
  ports: Ports,
  userId: string,
  runId: string,
): Promise<CommandResult<PayoutRun>> {
  const db = begin(source);
  const user = actor(db, userId);
  requireRole(user, ["ops"], "Only operations can approve a payout run.");
  const run = must(db.payoutRuns.find((item) => item.id === runId), "Payout run was not found.");
  if (run.raisedBy === user.id) throw new AppError("FORBIDDEN", "You cannot approve a payout run you raised.");
  if (!db.opsConfig.payoutApproverIds.includes(user.id) && db.opsConfig.payoutApproverIds.length > 0) {
    throw new AppError("FORBIDDEN", "You are not a configured payout approver.");
  }
  if (run.approvals.includes(user.id)) return { db: source, data: run, message: "You already approved this run." };
  run.approvals.push(user.id);
  const needsTwo = run.totalGhs > db.opsConfig.payoutApprovalThresholdGhs;
  run.status = !needsTwo || run.approvals.length >= 2 ? "APPROVED" : "PENDING_APPROVAL";
  return {
    db,
    data: run,
    message: run.status === "APPROVED" ? "Payout run approved." : "First approval recorded. A second approver is required.",
  };
}

export async function lockColdBox(
  source: AppDatabase,
  ports: Ports,
  userId: string,
  inspectionId: string,
): Promise<CommandResult<{ inspectionId: string }>> {
  const db = begin(source);
  const user = actor(db, userId);
  requireRole(user, ["field_agent"], "Only a field agent can close the cold box.");
  const inspection = must(db.inspections.find((item) => item.id === inspectionId), "Capture was not found.");
  if (inspection.locked) return { db: source, data: { inspectionId }, message: "This record is already locked." };
  if (!inspection.cratePhotoUri || !inspection.scalePhotoUri) {
    throw new AppError("INVALID_STATE", "Add the crate photo and the scale display photo before the cold box.");
  }
  inspection.coldBoxAt = ports.now();
  inspection.locked = true;
  audit(db, ports, user, "COLD_BOX", "FieldInspection", inspection.id, undefined, inspection.coldBoxAt);
  return { db, data: { inspectionId }, message: "Into cold box. Time stamped and the record is locked." };
}

export async function declineSale(
  source: AppDatabase,
  ports: Ports,
  userId: string,
  input: { consignmentId: string; reason: string },
): Promise<CommandResult<{ consignmentId: string }>> {
  const db = begin(source);
  const user = actor(db, userId);
  requireRole(user, ["field_agent"], "Only a field agent can decline a sale.");
  const consignment = must(db.consignments.find((item) => item.id === input.consignmentId), "Consignment was not found.");
  consignment.status = "CANCELLED";
  db.exceptions.push({
    id: ports.id("exception"),
    type: input.reason === "Farmer no show" ? "Farmer no show" : "Delivery rejection",
    severity: "HIGH",
    entityType: "Consignment",
    entityId: consignment.id,
    description: `Sale declined: ${input.reason}.`,
    createdBy: user.id,
    status: "OPEN",
    createdAt: ports.now(),
  });
  return { db, data: { consignmentId: consignment.id }, message: `Sale declined: ${input.reason}.` };
}

export async function saveOpsConfig(
  source: AppDatabase,
  ports: Ports,
  userId: string,
  config: OpsConfig,
): Promise<CommandResult<OpsConfig>> {
  const db = begin(source);
  const user = actor(db, userId);
  requireRole(user, ["ops"], "Only operations can change configuration.");
  db.opsConfig = config;
  audit(db, ports, user, "CONFIG", "OpsConfig", "ops", undefined, "updated");
  return { db, data: config, message: "Configuration saved." };
}

export async function markDeparted(
  source: AppDatabase,
  ports: Ports,
  userId: string,
  stopId: string,
): Promise<CommandResult<{ stopId: string }>> {
  const db = begin(source);
  const user = actor(db, userId);
  requireRole(user, ["driver"], "Only the driver can stamp departure.");
  const stop = must(db.stops.find((item) => item.id === stopId), "Stop was not found.");
  if (stop.status !== "COLLECTED" && stop.status !== "ARRIVED") {
    throw new AppError("INVALID_STATE", "Depart after you have arrived and collected.");
  }
  stop.departedAt = ports.now();
  stop.status = "IN_TRANSIT";
  audit(db, ports, user, "DEPARTED", "RouteStop", stop.id, "COLLECTED", "IN_TRANSIT");
  return { db, data: { stopId }, message: "Departed. Time stamped." };
}

export function hoursLeft(dueAt: string, now: string): number {
  return Math.max(0, Math.round((new Date(dueAt).getTime() - new Date(now).getTime()) / 36e5));
}
