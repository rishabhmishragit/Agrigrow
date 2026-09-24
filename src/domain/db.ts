import type { AppDatabase } from "./types";
import { AppError } from "./errors";

export function emptyDatabase(): AppDatabase {
  return {
    version: 1,
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
