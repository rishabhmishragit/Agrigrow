import type { AppDatabase, ProduceCategory } from "./types";
import { AppError } from "./errors";

const CATALOG: Record<string, { category: ProduceCategory; pricePerKg: number }> = {
  prod_tomato: { category: "vegetables", pricePerKg: 4.5 },
  prod_pepper: { category: "vegetables", pricePerKg: 8 },
  prod_okra: { category: "vegetables", pricePerKg: 5 },
  prod_maize: { category: "vegetables", pricePerKg: 3.2 },
  prod_yam: { category: "vegetables", pricePerKg: 4 },
  prod_mango: { category: "fruit", pricePerKg: 6 },
  prod_pineapple: { category: "fruit", pricePerKg: 5.5 },
  prod_goat: { category: "meat", pricePerKg: 45 },
  prod_tilapia: { category: "fish", pricePerKg: 28 },
  prod_milk: { category: "dairy", pricePerKg: 8 },
};

export function hydrateDatabase(stored: AppDatabase): AppDatabase {
  const base = emptyDatabase();
  const merged: AppDatabase = {
    ...base,
    ...stored,
    buyerOrders: stored.buyerOrders ?? base.buyerOrders,
    payoutRuns: stored.payoutRuns ?? base.payoutRuns,
    opsConfig: { ...base.opsConfig, ...(stored.opsConfig ?? {}) },
    produce: (stored.produce ?? []).map((item) => {
      const known = CATALOG[item.id];
      return {
        ...item,
        category: item.category ?? known?.category,
        pricePerKg: item.pricePerKg ?? known?.pricePerKg,
      };
    }),
  };
  return merged;
}

export function emptyDatabase(): AppDatabase {
  return {
    version: 1,
    buyerOrders: [],
    payoutRuns: [],
    opsConfig: {
      payoutApprovalThresholdGhs: 5000,
      payoutApproverIds: [],
      temperatureMinC: 0,
      temperatureMaxC: 8,
      checkpoints: ["load", "farm_stop", "depart_last", "arrival", "handover"],
    },
    users: [],
    farmerProfiles: [],
    offtakerProfiles: [],
    fieldAgentProfiles: [],
    driverProfiles: [],
    vehicles: [],
    produce: [],
    gradeScales: [],
    listings: [],
    consignments: [],
    lots: [],
    standingRequirements: [],
    commitments: [],
    escrows: [],
    collections: [],
    stops: [],
    inspections: [],
    grades: [],
    weights: [],
    manifests: [],
    deliveries: [],
    proofs: [],
    temperatures: [],
    locationPings: [],
    payments: [],
    settlements: [],
    notifications: [],
    smsMessages: [],
    ussdSessions: [],
    exceptions: [],
    auditLogs: [],
    syncQueue: [],
    idempotency: [],
    otpChallenges: [],
  };
}

export function cloneDatabase(db: AppDatabase): AppDatabase {
  return structuredClone(db);
}

export function must<T>(value: T | undefined, message: string): T {
  if (value === undefined || value === null) {
    throw new AppError("NOT_FOUND", message);
  }
  return value;
}
