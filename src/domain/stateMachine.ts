import { AppError } from "./errors";
import type { OrderState } from "./types";

const TRANSITIONS: Record<OrderState, OrderState[]> = {
  LISTED: ["AGGREGATING", "CANCELLED", "EXCEPTION"],
  AGGREGATING: ["LOT_CREATED", "CANCELLED", "EXCEPTION"],
  LOT_CREATED: ["COMMITTED", "CANCELLED", "EXCEPTION"],
  COMMITTED: ["ESCROW_PENDING", "CANCELLED", "EXCEPTION"],
  ESCROW_PENDING: ["ESCROW_FUNDED", "CANCELLED", "EXCEPTION"],
  ESCROW_FUNDED: ["COLLECTION_SCHEDULED", "EXCEPTION"],
  COLLECTION_SCHEDULED: ["FIELD_CONFIRMED", "EXCEPTION"],
  FIELD_CONFIRMED: ["COLLECTED", "EXCEPTION"],
  COLLECTED: ["IN_TRANSIT", "EXCEPTION"],
  IN_TRANSIT: ["DELIVERED", "EXCEPTION"],
  DELIVERED: ["ACCEPTED", "EXCEPTION"],
  ACCEPTED: ["ESCROW_RELEASE_REQUESTED", "EXCEPTION"],
  ESCROW_RELEASE_REQUESTED: ["ESCROW_RELEASED", "EXCEPTION"],
  ESCROW_RELEASED: ["SETTLEMENT_PROCESSING", "EXCEPTION"],
  SETTLEMENT_PROCESSING: ["SETTLED", "EXCEPTION"],
  SETTLED: [],
  EXCEPTION: [],
  CANCELLED: [],
};

export function canTransition(from: OrderState, to: OrderState): boolean {
  if (from === to) return true;
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: OrderState, to: OrderState): void {
  if (from === to) return;
  if (!TRANSITIONS[from].includes(to)) {
    throw new AppError(
      "INVALID_TRANSITION",
      `This order cannot move from ${from} to ${to}.`,
    );
  }
}

export function allowedTransitions(from: OrderState): OrderState[] {
  return [...TRANSITIONS[from]];
}
