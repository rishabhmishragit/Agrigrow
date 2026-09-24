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
 * Consignment settlement. The farmer is paid the gross value.
 * No collection fee is deducted.
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
  const rawCollectionFee = 0;
  const collectionFeeCap = 0;
  const feeCapped = false;
  const collectionFee = 0;
  const netSettlement = roundGhs(grossValue - otherDeductions);

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
  const otherCharges = roundGhs(input.otherCharges);
  return {
    lotValue,
    collectionFees: 0,
    otherCharges,
    totalEscrowRequirement: roundGhs(lotValue + otherCharges),
  };
}
