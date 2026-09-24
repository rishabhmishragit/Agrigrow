import { cloneDatabase, must } from "./db";
import { AppError } from "./errors";
import { logEvent } from "./logger";
import { assertTransition } from "./stateMachine";
import type {
  AppDatabase,
  AuditLog,
  FarmerProfile,
  FieldAgentProfile,
  DriverProfile,
  OfftakerProfile,
  OrderState,
  Role,
  User,
} from "./types";
import type {
  EscrowProvider,
  ObjectStorage,
  PaymentProvider,
  SMSProvider,
  TrackingProvider,
} from "../providers/types";

export interface Ports {
  now(): string;
  id(prefix: string): string;
  payment: PaymentProvider;
  escrow: EscrowProvider;
  sms: SMSProvider;
  tracking: TrackingProvider;
  storage: ObjectStorage;
  escrowBankLabel: string;
}

export interface CommandResult<T> {
  db: AppDatabase;
  data: T;
  message?: string;
}

export function begin(source: AppDatabase): AppDatabase {
  return cloneDatabase(source);
}

export function actor(db: AppDatabase, userId: string): User {
  const user = db.users.find((item) => item.id === userId && item.active);
  if (!user) {
    throw new AppError("UNAUTHENTICATED", "Your session is not valid. Sign in again.");
  }
  return user;
}

export function requireRole(user: User, roles: Role[], message: string): void {
  if (!roles.includes(user.role)) {
    throw new AppError("FORBIDDEN", message);
  }
}

export function farmerForUser(db: AppDatabase, userId: string): FarmerProfile {
  return must(
    db.farmerProfiles.find((item) => item.userId === userId),
    "Farmer profile was not found.",
  );
}

export function offtakerForUser(db: AppDatabase, userId: string): OfftakerProfile {
  return must(
    db.offtakerProfiles.find((item) => item.userId === userId),
    "Offtaker profile was not found.",
  );
}

export function agentForUser(db: AppDatabase, userId: string): FieldAgentProfile {
  return must(
    db.fieldAgentProfiles.find((item) => item.userId === userId),
    "Field agent profile was not found.",
  );
}

export function driverForUser(db: AppDatabase, userId: string): DriverProfile {
  return must(
    db.driverProfiles.find((item) => item.userId === userId),
    "Driver profile was not found.",
  );
}

export function audit(
  db: AppDatabase,
  ports: Ports,
  user: User,
  action: string,
  entity: string,
  entityId: string,
  previousState?: string,
  newState?: string,
  metadata?: Record<string, unknown>,
): AuditLog {
  const entry: AuditLog = {
    id: ports.id("audit"),
    actorId: user.id,
    role: user.role,
    action,
    entity,
    entityId,
    previousState,
    newState,
    timestamp: ports.now(),
    metadata,
  };
  db.auditLogs.push(entry);
  return entry;
}

export function notify(
  db: AppDatabase,
  ports: Ports,
  userId: string,
  title: string,
  body: string,
  entityType?: string,
  entityId?: string,
): void {
  db.notifications.push({
    id: ports.id("note"),
    userId,
    channel: "in_app",
    title,
    body,
    read: false,
    createdAt: ports.now(),
    entityType,
    entityId,
  });
}

export async function sendSms(
  db: AppDatabase,
  ports: Ports,
  input: { to: string; body: string; event: string; idempotencyKey: string; userId?: string },
): Promise<void> {
  if (db.smsMessages.some((item) => item.idempotencyKey === input.idempotencyKey)) return;
  try {
    const result = await ports.sms.send({
      to: input.to,
      body: input.body,
      idempotencyKey: input.idempotencyKey,
    });
    db.smsMessages.push({
      id: ports.id("sms"),
      to: input.to,
      body: input.body,
      status: result.status,
      provider: ports.sms.name,
      providerMessageId: result.providerMessageId,
      idempotencyKey: input.idempotencyKey,
      createdAt: ports.now(),
      event: input.event,
      userId: input.userId,
    });
  } catch (error) {
    logEvent("error", "sms_failed", { event: input.event, message: error instanceof Error ? error.message : "failed" });
    db.smsMessages.push({
      id: ports.id("sms"),
      to: input.to,
      body: input.body,
      status: "failed",
      provider: ports.sms.name,
      idempotencyKey: input.idempotencyKey,
      createdAt: ports.now(),
      event: input.event,
      userId: input.userId,
    });
  }
}

export function claimIdempotency(
  db: AppDatabase,
  ports: Ports,
  key: string,
  operation: string,
  entityId: string,
): boolean {
  if (db.idempotency.some((item) => item.key === key)) return false;
  db.idempotency.push({
    key,
    operation,
    entityId,
    createdAt: ports.now(),
  });
  return true;
}

export function orderStateOf(db: AppDatabase, lotId: string): OrderState {
  const commitment = db.commitments.find((item) => item.lotId === lotId);
  const lot = must(db.lots.find((item) => item.id === lotId), "Lot was not found.");
  return commitment?.orderState ?? lot.orderState;
}

export function setOrder(
  db: AppDatabase,
  ports: Ports,
  user: User,
  lotId: string,
  to: OrderState,
  action: string,
  metadata?: Record<string, unknown>,
): void {
  const lot = must(db.lots.find((item) => item.id === lotId), "Lot was not found.");
  const commitment = db.commitments.find((item) => item.lotId === lotId);
  const from = commitment?.orderState ?? lot.orderState;
  if (from === to) return;
  assertTransition(from, to);
  if (to === "EXCEPTION") {
    lot.stateBeforeException = from;
    if (commitment) commitment.stateBeforeException = from;
  }
  lot.orderState = to;
  if (commitment) commitment.orderState = to;
  audit(db, ports, user, action, "Lot", lot.id, from, to, metadata);
}

export function userByFarmer(db: AppDatabase, farmerId: string): User {
  const profile = must(
    db.farmerProfiles.find((item) => item.id === farmerId),
    "Farmer profile was not found.",
  );
  return must(db.users.find((item) => item.id === profile.userId), "Farmer user was not found.");
}

export function phoneOf(db: AppDatabase, userId: string): string {
  return must(db.users.find((item) => item.id === userId), "User was not found.").phone;
}
