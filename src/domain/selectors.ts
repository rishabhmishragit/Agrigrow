import { calculateConsignmentSettlement, calculateEscrowInstruction, type SettlementBreakdown } from "./economics";
import { roundGhs } from "./money";
import type { AppDatabase, Consignment, OrderState, User } from "./types";

export function produceName(db: AppDatabase, produceId: string): string {
  return db.produce.find((item) => item.id === produceId)?.name ?? "Produce";
}

export function userName(db: AppDatabase, userId: string): string {
  return db.users.find((item) => item.id === userId)?.fullName ?? "Unknown";
}

export function farmerName(db: AppDatabase, farmerId: string): string {
  const profile = db.farmerProfiles.find((item) => item.id === farmerId);
  return profile ? userName(db, profile.userId) : "Farmer";
}

export function lotConsignments(db: AppDatabase, lotId: string): Consignment[] {
  return db.consignments.filter((item) => item.lotId === lotId);
}

export function escrowInstructionForLot(db: AppDatabase, lotId: string) {
  const lot = db.lots.find((item) => item.id === lotId);
  if (!lot) return undefined;
  const consignments = lotConsignments(db, lotId);
  return calculateEscrowInstruction({
    grossValues: consignments.map((item) => roundGhs((item.acceptedWeight ?? item.expectedQuantity) * item.agreedPricePerUnit)),
    stopCollectionFees: [lot.collectionFeePerStop],
    otherCharges: lot.otherCharges,
  });
}

export function previewNewLot(
  quantities: number[],
  pricePerUnit: number,
  collectionFee: number,
  otherCharges = 0,
) {
  const total = quantities.reduce((sum, quantity) => sum + quantity, 0);
  const rows = quantities.map((quantity) =>
    calculateConsignmentSettlement({
      confirmedWeight: quantity,
      pricePerUnit,
      consignmentWeight: quantity,
      totalStopWeight: total,
      stopCollectionFee: collectionFee,
    }),
  );
  return {
    estimated: true,
    rows,
    instruction: calculateEscrowInstruction({
      grossValues: rows.map((row) => row.grossValue),
      stopCollectionFees: [collectionFee],
      otherCharges,
    }),
  };
}

export function previewConsignment(db: AppDatabase, consignment: Consignment): SettlementBreakdown | undefined {
  const lot = db.lots.find((item) => item.id === consignment.lotId);
  if (!lot) return undefined;
  const stop = db.stops.find((item) => item.id === consignment.collectionStopId && item.kind === "COLLECTION");
  const group = stop ? db.consignments.filter((item) => stop.consignmentIds.includes(item.id)) : lotConsignments(db, lot.id);
  const weightOf = (item: Consignment) => item.acceptedWeight ?? item.expectedQuantity;
  const total = group.reduce((sum, item) => sum + weightOf(item), 0);
  return calculateConsignmentSettlement({
    confirmedWeight: weightOf(consignment),
    pricePerUnit: consignment.agreedPricePerUnit,
    consignmentWeight: weightOf(consignment),
    totalStopWeight: total,
    stopCollectionFee: stop?.collectionFee ?? lot.collectionFeePerStop,
  });
}

export interface OpsKpis {
  activeFarmers: number;
  activeListings: number;
  lotsAwaitingCommitment: number;
  lotsCommitted: number;
  escrowPending: number;
  escrowFunded: number;
  collectionsToday: number;
  deliveriesToday: number;
  exceptions: number;
  pendingAcceptance: number;
  pendingSettlement: number;
  completedSettlements: number;
}

export function opsKpis(db: AppDatabase, today: string): OpsKpis {
  const day = today.slice(0, 10);
  const countState = (state: OrderState) => db.lots.filter((item) => item.orderState === state).length;
  return {
    activeFarmers: db.farmerProfiles.length,
    activeListings: db.listings.filter((item) => item.status === "AVAILABLE" || item.status === "SCHEDULED").length,
    lotsAwaitingCommitment: db.lots.filter((item) => item.status === "PUBLISHED").length,
    lotsCommitted: db.commitments.length,
    escrowPending: db.escrows.filter((item) => item.status === "PENDING").length,
    escrowFunded: db.escrows.filter((item) => item.status === "FUNDED" || item.status === "RELEASED").length,
    collectionsToday: db.collections.filter((item) => item.scheduledDate.slice(0, 10) === day).length,
    deliveriesToday: db.deliveries.filter((item) => item.deliveredAt?.slice(0, 10) === day || item.status === "PENDING" || item.status === "IN_TRANSIT").length,
    exceptions: db.exceptions.filter((item) => item.status === "OPEN" || item.status === "ASSIGNED" || item.status === "IN_PROGRESS").length,
    pendingAcceptance: countState("DELIVERED"),
    pendingSettlement: db.lots.filter((item) => item.orderState === "ACCEPTED" || item.orderState === "ESCROW_RELEASE_REQUESTED" || item.orderState === "SETTLEMENT_PROCESSING").length,
    completedSettlements: db.settlements.filter((item) => item.status === "PAID").length,
  };
}

export function visibleLots(db: AppDatabase, user: User) {
  if (user.role === "ops") return db.lots;
  if (user.role === "offtaker") {
    const profile = db.offtakerProfiles.find((item) => item.userId === user.id);
    return db.lots.filter((lot) => {
      if (lot.status === "PUBLISHED") return true;
      const commitment = db.commitments.find((item) => item.lotId === lot.id);
      return commitment?.offtakerId === profile?.id;
    });
  }
  if (user.role === "farmer") {
    const profile = db.farmerProfiles.find((item) => item.userId === user.id);
    const lotIds = new Set(db.consignments.filter((item) => item.farmerId === profile?.id).map((item) => item.lotId));
    return db.lots.filter((item) => lotIds.has(item.id));
  }
  return [];
}

export const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  AVAILABLE: "Available",
  ALLOCATED: "Allocated",
  SCHEDULED: "Scheduled",
  COLLECTED: "Collected",
  SETTLED: "Settled",
  CANCELLED: "Cancelled",
  LISTED: "Listed",
  AGGREGATING: "Aggregating",
  LOT_CREATED: "Lot ready",
  COMMITTED: "Committed",
  ESCROW_PENDING: "Awaiting payment",
  ESCROW_FUNDED: "Paid",
  COLLECTION_SCHEDULED: "Scheduled",
  FIELD_CONFIRMED: "Field confirmed",
  IN_TRANSIT: "In transit",
  DELIVERED: "Delivered",
  ACCEPTED: "Accepted",
  ESCROW_RELEASE_REQUESTED: "Release requested",
  ESCROW_RELEASED: "Payout approved",
  SETTLEMENT_PROCESSING: "Paying farmers",
  EXCEPTION: "Exception",
  PENDING: "Pending",
  FUNDED: "Paid",
  RELEASE_REQUESTED: "Release requested",
  RELEASED: "Released",
  FAILED: "Failed",
  PAID: "Paid",
  PROCESSING: "Processing",
  OPEN: "Open",
  ASSIGNED: "Assigned",
  IN_PROGRESS: "In progress",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
  ACTIVE: "Active",
  FULFILLED: "Fulfilled",
  ARRIVED: "Arrived",
  SYNCED: "Synced",
  CONFLICT: "Sync conflict",
};
