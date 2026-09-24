import { AppError } from "./errors";
import { roundGhs } from "./money";

/** Farmer-level cap: allocated collection fee cannot exceed 5% of that farmer's own consignment value. */
export const COLLECTION_FEE_CAP_RATIO = 0.05;

export interface SettlementBreakdown {
  grossValue: number;
  rawCollectionFee: number;
  collectionFeeCap: number;
  collectionFee: number;
  feeCapped: boolean;
  otherDeductions: number;
  netSettlement: number;
}

export interface ConsignmentEconomicsInput {
  confirmedWeight: number;
  pricePerUnit: number;
  consignmentWeight: number;
  totalStopWeight: number;
  stopCollectionFee: number;
  otherDeductions?: number;
}

function assertNonNegative(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new AppError("INVALID_AMOUNT", `${label} must be zero or greater.`);
  }
}

/**
 * Consignment settlement.
 * Collection fee share = consignment weight / total stop weight × stop fee.
 * The share is then capped at 5% of this farmer's gross consignment value.
 */
export function calculateConsignmentSettlement(
  input: ConsignmentEconomicsInput,
): SettlementBreakdown {
  assertNonNegative(input.confirmedWeight, "Confirmed weight");
  assertNonNegative(input.pricePerUnit, "Price");
  assertNonNegative(input.consignmentWeight, "Consignment weight");
  assertNonNegative(input.totalStopWeight, "Total stop weight");
  assertNonNegative(input.stopCollectionFee, "Collection fee");
  const otherDeductions = input.otherDeductions ?? 0;
  assertNonNegative(otherDeductions, "Other deductions");

  if (input.totalStopWeight <= 0 && input.stopCollectionFee > 0) {
    throw new AppError(
      "INVALID_AMOUNT",
      "Total stop weight must be greater than zero before a collection fee can be allocated.",
    );
  }

  const grossValue = roundGhs(input.confirmedWeight * input.pricePerUnit);
  const rawCollectionFee =
    input.totalStopWeight === 0
      ? 0
      : roundGhs((input.consignmentWeight / input.totalStopWeight) * input.stopCollectionFee);
  const collectionFeeCap = roundGhs(grossValue * COLLECTION_FEE_CAP_RATIO);
  const feeCapped = rawCollectionFee > collectionFeeCap;
  const collectionFee = roundGhs(Math.min(rawCollectionFee, collectionFeeCap));
  const netSettlement = roundGhs(grossValue - collectionFee - otherDeductions);

  return {
    grossValue,
    rawCollectionFee,
    collectionFeeCap,
    collectionFee,
    feeCapped,
    otherDeductions: roundGhs(otherDeductions),
    netSettlement,
  };
}

export interface EscrowInstruction {
  lotValue: number;
  collectionFees: number;
  otherCharges: number;
  totalEscrowRequirement: number;
}

/** Buyer-facing escrow instruction. This is not an internal balance. */
export function calculateEscrowInstruction(input: {
  grossValues: number[];
  stopCollectionFees: number[];
  otherCharges: number;
}): EscrowInstruction {
  const lotValue = roundGhs(input.grossValues.reduce((sum, value) => sum + value, 0));
  const collectionFees = roundGhs(input.stopCollectionFees.reduce((sum, value) => sum + value, 0));
  const otherCharges = roundGhs(input.otherCharges);
  return {
    lotValue,
    collectionFees,
    otherCharges,
    totalEscrowRequirement: roundGhs(lotValue + collectionFees + otherCharges),
  };
}
