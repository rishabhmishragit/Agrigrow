import { must } from "./db";
import { AppError } from "./errors";
import { logEvent } from "./logger";
import {
  actor,
  agentForUser,
  audit,
  begin,
  CommandResult,
  driverForUser,
  notify,
  orderStateOf,
  Ports,
  requireRole,
  sendSms,
  setOrder,
  userByFarmer,
} from "./support";
import type { AppDatabase, FieldInspection, GradeOption, ProofOfDelivery, SyncQueueItem } from "./types";

const OFFLINE_MESSAGE =
  "You are offline. Your changes have been saved and will sync automatically when connectivity returns.";
const SYNC_RETRY_MESSAGE = "Saved locally. Sync will retry automatically.";

export interface InspectionInput {
  consignmentId: string;
  actualQuantity: number;
  rejectedQuantity: number;
  gradeCode: string;
  notes?: string;
  photoUris?: string[];
  latitude?: number;
  longitude?: number;
  scaleRef?: string;
  idempotencyKey: string;
  offline: boolean;
}

export async function recordInspection(
  source: AppDatabase,
  ports: Ports,
  userId: string,
  input: InspectionInput,
): Promise<CommandResult<FieldInspection>> {
  const db = begin(source);
  const user = actor(db, userId);
  requireRole(user, ["field_agent", "ops"], "Only a field agent can record grade and weight.");
  const consignment = must(db.consignments.find((item) => item.id === input.consignmentId), "Consignment was not found.");
  const collection = must(
    db.collections.find((item) => item.lotId === consignment.lotId),
    "This consignment has no collection assignment.",
  );
  if (user.role === "field_agent" && agentForUser(db, user.id).id !== collection.fieldAgentId) {
    throw new AppError("FORBIDDEN", "This collection is assigned to another field agent.");
  }
  if (orderStateOf(db, consignment.lotId) !== "COLLECTION_SCHEDULED" && orderStateOf(db, consignment.lotId) !== "FIELD_CONFIRMED") {
    throw new AppError("INVALID_STATE", "Grade and weight can only be recorded after collection is scheduled.");
  }
  validateQuantities(input.actualQuantity, input.rejectedQuantity);
  const grade = gradeFor(db, consignment.produceId, input.gradeCode);
  const existing = db.inspections.find((item) => item.idempotencyKey === input.idempotencyKey);
  if (existing?.syncStatus === "SYNCED") {
    return { db: source, data: existing, message: "This inspection was already synchronised." };
  }
  const acceptedQuantity = roundQuantity(input.actualQuantity - input.rejectedQuantity);
  const qualityStatus = qualityFor(input.actualQuantity, input.rejectedQuantity, grade.acceptable);
  if (existing && existing.syncStatus === "PENDING") {
    existing.actualQuantity = input.actualQuantity;
    existing.rejectedQuantity = input.rejectedQuantity;
    existing.acceptedQuantity = acceptedQuantity;
    existing.gradeCode = grade.code;
    existing.qualityStatus = qualityStatus;
    existing.notes = input.notes;
    existing.photoUris = input.photoUris ?? existing.photoUris;
    existing.latitude = input.latitude;
    existing.longitude = input.longitude;
    return {
      db,
      data: existing,
      message: input.offline ? OFFLINE_MESSAGE : undefined,
    };
  }
  const inspection: FieldInspection = {
    id: ports.id("inspection"),
    consignmentId: consignment.id,
    collectionId: collection.id,
    agentId: user.role === "field_agent" ? agentForUser(db, user.id).id : collection.fieldAgentId,
    expectedQuantity: consignment.expectedQuantity,
    actualQuantity: input.actualQuantity,
    rejectedQuantity: input.rejectedQuantity,
    acceptedQuantity,
    gradeCode: grade.code,
    qualityStatus,
    notes: input.notes,
    photoUris: input.photoUris ?? [],
    latitude: input.latitude,
    longitude: input.longitude,
    recordedAt: ports.now(),
    syncStatus: input.offline ? "PENDING" : "SYNCED",
    idempotencyKey: input.idempotencyKey,
  };
  db.inspections.push(inspection);
  if (input.offline) {
    enqueue(db, ports, user.id, {
      entityType: "FieldInspection",
      entityId: inspection.id,
      action: "RECORD_INSPECTION",
      idempotencyKey: input.idempotencyKey,
      payload: { inspectionId: inspection.id, scaleRef: input.scaleRef ?? "" },
    });
    return { db, data: inspection, message: OFFLINE_MESSAGE };
  }
  await promoteInspection(db, ports, user.id, inspection, input.scaleRef);
  return { db, data: inspection, message: "Grade and weight recorded." };
}

async function promoteInspection(
  db: AppDatabase,
  ports: Ports,
  userId: string,
  inspection: FieldInspection,
  scaleRef?: string,
): Promise<void> {
  const user = actor(db, userId);
  const consignment = must(db.consignments.find((item) => item.id === inspection.consignmentId), "Consignment was not found.");
  const otherSynced = db.inspections.find(
    (item) =>
      item.consignmentId === consignment.id &&
      item.syncStatus === "SYNCED" &&
      item.id !== inspection.id,
  );
  if (otherSynced) {
    inspection.syncStatus = "CONFLICT";
    throw new AppError(
      "CONFLICT",
      "A confirmed inspection already exists for this consignment. Your copy is kept for operations to resolve.",
    );
  }
  if (!db.grades.some((item) => item.inspectionId === inspection.id)) {
    const scale = must(
      db.gradeScales.find((item) => item.produceId === consignment.produceId),
      "No grading scale is configured for this produce.",
    );
    db.grades.push({
      id: ports.id("grade"),
      inspectionId: inspection.id,
      consignmentId: consignment.id,
      code: inspection.gradeCode,
      scaleId: scale.id,
      recordedAt: inspection.recordedAt,
    });
  }
  if (!db.weights.some((item) => item.inspectionId === inspection.id)) {
    db.weights.push({
      id: ports.id("weight"),
      inspectionId: inspection.id,
      consignmentId: consignment.id,
      expectedWeight: inspection.expectedQuantity,
      actualWeight: inspection.acceptedQuantity,
      unit: consignment.unit,
      scaleRef,
      recordedAt: inspection.recordedAt,
      agentId: inspection.agentId,
      latitude: inspection.latitude,
      longitude: inspection.longitude,
    });
  }
  const storedPhotos: string[] = [];
  for (const uri of inspection.photoUris) {
    if (uri.startsWith("mock-storage://")) {
      storedPhotos.push(uri);
    } else {
      const stored = await ports.storage.put({ localUri: uri, path: `evidence/${inspection.id}/${storedPhotos.length}` });
      storedPhotos.push(stored.url);
    }
  }
  inspection.photoUris = storedPhotos;
  inspection.syncStatus = "SYNCED";
  consignment.confirmedWeight = inspection.actualQuantity;
  consignment.acceptedWeight = inspection.acceptedQuantity;
  consignment.gradeCode = inspection.gradeCode;
  audit(db, ports, user, "FIELD_INSPECTION", "FieldInspection", inspection.id, undefined, "SYNCED", {
    grade: inspection.gradeCode,
    acceptedQuantity: inspection.acceptedQuantity,
  });
  const lotConsignments = db.consignments.filter((item) => item.lotId === consignment.lotId);
  const allSynced = lotConsignments.every((item) =>
    db.inspections.some((inspectionRow) => inspectionRow.consignmentId === item.id && inspectionRow.syncStatus === "SYNCED"),
  );
  if (allSynced && orderStateOf(db, consignment.lotId) === "COLLECTION_SCHEDULED") {
    setOrder(db, ports, user, consignment.lotId, "FIELD_CONFIRMED", "FIELD_CONFIRMED");
  }
}

export interface CollectionStampInput {
  stopId: string;
  idempotencyKey: string;
  offline: boolean;
  latitude?: number;
  longitude?: number;
  notes?: string;
}

export async function confirmCollection(
  source: AppDatabase,
  ports: Ports,
  userId: string,
  input: CollectionStampInput,
): Promise<CommandResult<{ stopId: string; orderState: string }>> {
  const db = begin(source);
  const user = actor(db, userId);
  requireRole(user, ["driver", "ops"], "Only the assigned driver can confirm collection.");
  const stop = must(db.stops.find((item) => item.id === input.stopId && item.kind === "COLLECTION"), "Collection stop was not found.");
  const manifest = must(db.manifests.find((item) => item.id === stop.manifestId), "Manifest was not found.");
  if (user.role === "driver" && driverForUser(db, user.id).id !== manifest.driverId) {
    throw new AppError("FORBIDDEN", "This route is assigned to another driver.");
  }
  const lotState = orderStateOf(db, stop.lotId);
  const escrowFunded = escrowIsFunded(db, stop.lotId);
  if (!escrowFunded) {
    throw new AppError(
      "ESCROW_NOT_FUNDED",
      "Collection cannot begin because escrow funding has not been confirmed.",
    );
  }
  if (lotState !== "FIELD_CONFIRMED" && lotState !== "COLLECTED") {
    throw new AppError("INVALID_STATE", "Collection cannot be confirmed until the field agent has synced grade and weight.");
  }
  if (!db.temperatures.some((item) => item.stopId === stop.id && item.syncStatus === "SYNCED" || (item.stopId === stop.id && item.syncStatus === "PENDING"))) {
    throw new AppError("TEMPERATURE_REQUIRED", "Record the temperature before confirming this stop.");
  }
  if (stop.status === "COLLECTED") {
    return { db: source, data: { stopId: stop.id, orderState: lotState }, message: "Collection was already confirmed." };
  }
  if (input.offline) {
    stop.status = "COLLECTED";
    enqueue(db, ports, user.id, {
      entityType: "RouteStop",
      entityId: stop.id,
      action: "COLLECTION_STAMP",
      idempotencyKey: input.idempotencyKey,
      payload: { stopId: stop.id, latitude: input.latitude ?? null, longitude: input.longitude ?? null },
    });
    return { db, data: { stopId: stop.id, orderState: lotState }, message: OFFLINE_MESSAGE };
  }
  applyCollection(db, ports, user.id, stop.id, input.latitude, input.longitude);
  return { db, data: { stopId: stop.id, orderState: orderStateOf(db, stop.lotId) }, message: "Collection confirmed." };
}

function applyCollection(
  db: AppDatabase,
  ports: Ports,
  userId: string,
  stopId: string,
  latitude?: number,
  longitude?: number,
): void {
  const user = actor(db, userId);
  const stop = must(db.stops.find((item) => item.id === stopId), "Collection stop was not found.");
  if (stop.status === "COLLECTED" && orderStateOf(db, stop.lotId) !== "FIELD_CONFIRMED") {
    return;
  }
  stop.status = "COLLECTED";
  stop.completedAt = ports.now();
  if (latitude !== undefined) stop.latitude = latitude;
  if (longitude !== undefined) stop.longitude = longitude;
  for (const consignmentId of stop.consignmentIds) {
    const consignment = db.consignments.find((item) => item.id === consignmentId);
    if (!consignment) continue;
    consignment.status = "COLLECTED";
    const listing = db.listings.find((item) => item.id === consignment.listingId);
    if (listing) {
      listing.status = "COLLECTED";
      listing.updatedAt = ports.now();
    }
  }
  audit(db, ports, user, "COLLECTION_CONFIRMED", "RouteStop", stop.id, "PENDING", "COLLECTED");
  const collectionStops = db.stops.filter((item) => item.lotId === stop.lotId && item.kind === "COLLECTION");
  if (collectionStops.every((item) => item.status === "COLLECTED") && orderStateOf(db, stop.lotId) === "FIELD_CONFIRMED") {
    setOrder(db, ports, user, stop.lotId, "COLLECTED", "LOT_COLLECTED");
    const collection = db.collections.find((item) => item.id === stop.collectionId);
    if (collection) collection.status = "COLLECTED";
  }
}

export async function departWithLoad(
  source: AppDatabase,
  ports: Ports,
  userId: string,
  lotId: string,
): Promise<CommandResult<{ orderState: string }>> {
  const db = begin(source);
  const user = actor(db, userId);
  requireRole(user, ["driver", "ops"], "Only the driver can start transit.");
  if (orderStateOf(db, lotId) !== "COLLECTED") {
    throw new AppError("INVALID_STATE", "Transit starts only after collection is confirmed.");
  }
  setOrder(db, ports, user, lotId, "IN_TRANSIT", "IN_TRANSIT");
  for (const stop of db.stops.filter((item) => item.lotId === lotId && item.kind === "DELIVERY")) {
    stop.status = "IN_TRANSIT";
  }
  return { db, data: { orderState: "IN_TRANSIT" } };
}

export interface DeliveryStampInput {
  stopId: string;
  receiverName: string;
  signatureName: string;
  notes?: string;
  photoUris?: string[];
  latitude?: number;
  longitude?: number;
  idempotencyKey: string;
  offline: boolean;
}

export async function confirmDelivery(
  source: AppDatabase,
  ports: Ports,
  userId: string,
  input: DeliveryStampInput,
): Promise<CommandResult<ProofOfDelivery>> {
  const db = begin(source);
  const user = actor(db, userId);
  requireRole(user, ["driver", "ops"], "Only the assigned driver can confirm delivery.");
  const stop = must(db.stops.find((item) => item.id === input.stopId && item.kind === "DELIVERY"), "Delivery stop was not found.");
  const manifest = must(db.manifests.find((item) => item.id === stop.manifestId), "Manifest was not found.");
  if (user.role === "driver" && driverForUser(db, user.id).id !== manifest.driverId) {
    throw new AppError("FORBIDDEN", "This route is assigned to another driver.");
  }
  if (!input.receiverName.trim() || !input.signatureName.trim()) {
    throw new AppError("INVALID_POD", "Enter the receiver name and signature acknowledgement.");
  }
  const state = orderStateOf(db, stop.lotId);
  if (state !== "IN_TRANSIT" && state !== "DELIVERED") {
    throw new AppError("INVALID_STATE", "Delivery can be confirmed only while the lot is in transit.");
  }
  const hasTemperature = db.temperatures.some((item) => item.deliveryId || item.stopId === stop.id);
  if (!db.temperatures.some((item) => item.stopId === stop.id)) {
    throw new AppError("TEMPERATURE_REQUIRED", "Record the temperature before confirming delivery.");
  }
  void hasTemperature;
  const existingProof = db.proofs.find((item) => item.idempotencyKey === input.idempotencyKey);
  if (existingProof?.syncStatus === "SYNCED") {
    return { db: source, data: existingProof, message: "Delivery was already confirmed." };
  }
  const delivery = must(db.deliveries.find((item) => item.lotId === stop.lotId), "Delivery record was not found.");
  const proof: ProofOfDelivery = existingProof ?? {
    id: ports.id("pod"),
    deliveryId: delivery.id,
    photoUris: input.photoUris ?? [],
    receiverName: input.receiverName.trim(),
    signatureName: input.signatureName.trim(),
    notes: input.notes,
    timestamp: ports.now(),
    latitude: input.latitude,
    longitude: input.longitude,
    driverId: manifest.driverId,
    syncStatus: input.offline ? "PENDING" : "SYNCED",
    idempotencyKey: input.idempotencyKey,
  };
  if (!existingProof) db.proofs.push(proof);
  if (input.offline) {
    proof.syncStatus = "PENDING";
    enqueue(db, ports, user.id, {
      entityType: "ProofOfDelivery",
      entityId: proof.id,
      action: "DELIVERY_STAMP",
      idempotencyKey: input.idempotencyKey,
      payload: { proofId: proof.id, stopId: stop.id },
    });
    return { db, data: proof, message: OFFLINE_MESSAGE };
  }
  await applyDelivery(db, ports, user.id, proof.id, stop.id);
  return { db, data: proof, message: "Delivery confirmed. The offtaker can now accept the goods." };
}

async function applyDelivery(db: AppDatabase, ports: Ports, userId: string, proofId: string, stopId: string): Promise<void> {
  const user = actor(db, userId);
  const proof = must(db.proofs.find((item) => item.id === proofId), "Proof of delivery was not found.");
  const stop = must(db.stops.find((item) => item.id === stopId), "Delivery stop was not found.");
  const delivery = must(db.deliveries.find((item) => item.id === proof.deliveryId), "Delivery was not found.");
  if (proof.syncStatus === "SYNCED" && delivery.status === "DELIVERED") return;
  const photos: string[] = [];
  for (const uri of proof.photoUris) {
    photos.push(uri.startsWith("mock-storage://") ? uri : (await ports.storage.put({ localUri: uri, path: `pod/${proof.id}/${photos.length}` })).url);
  }
  proof.photoUris = photos;
  proof.syncStatus = "SYNCED";
  stop.status = "DELIVERED";
  stop.completedAt = proof.timestamp;
  delivery.status = "DELIVERED";
  delivery.deliveredAt = proof.timestamp;
  delivery.syncStatus = "SYNCED";
  if (orderStateOf(db, stop.lotId) === "IN_TRANSIT") {
    setOrder(db, ports, user, stop.lotId, "DELIVERED", "DELIVERY_CONFIRMED");
  }
  audit(db, ports, user, "DELIVERY_CONFIRMED", "Delivery", delivery.id, "IN_TRANSIT", "DELIVERED");
  const commitment = must(db.commitments.find((item) => item.lotId === stop.lotId), "Commitment was not found.");
  const offtaker = must(db.offtakerProfiles.find((item) => item.id === commitment.offtakerId), "Offtaker was not found.");
  const lot = must(db.lots.find((item) => item.id === stop.lotId), "Lot was not found.");
  notify(
    db,
    ports,
    offtaker.userId,
    "Acceptance required",
    `${lot.code} has been delivered. Review the proof and accept the goods.`,
    "Delivery",
    delivery.id,
  );
  for (const consignment of db.consignments.filter((item) => item.lotId === lot.id)) {
    const farmerUser = userByFarmer(db, consignment.farmerId);
    await sendSms(db, ports, {
      to: farmerUser.phone,
      userId: farmerUser.id,
      event: "delivery_completed",
      idempotencyKey: `sms:delivered:${delivery.id}:${consignment.id}`,
      body: `CryoChain: your ${consignment.expectedQuantity} ${consignment.unit} consignment on ${lot.code} was delivered.`,
    });
  }
}

export async function recordTemperature(
  source: AppDatabase,
  ports: Ports,
  userId: string,
  input: {
    stopId: string;
    temperature: number;
    unit: "C" | "F";
    latitude?: number;
    longitude?: number;
    idempotencyKey: string;
    offline: boolean;
  },
): Promise<CommandResult<{ id: string }>> {
  const db = begin(source);
  const user = actor(db, userId);
  requireRole(user, ["driver", "ops"], "Only the driver can record temperature.");
  const stop = must(db.stops.find((item) => item.id === input.stopId), "Stop was not found.");
  const manifest = must(db.manifests.find((item) => item.id === stop.manifestId), "Manifest was not found.");
  if (user.role === "driver" && driverForUser(db, user.id).id !== manifest.driverId) {
    throw new AppError("FORBIDDEN", "This route is assigned to another driver.");
  }
  if (!Number.isFinite(input.temperature)) {
    throw new AppError("INVALID_AMOUNT", "Enter a temperature reading.");
  }
  const existing = db.temperatures.find((item) => item.idempotencyKey === input.idempotencyKey);
  if (existing) return { db: source, data: { id: existing.id }, message: "Temperature was already recorded." };
  const id = ports.id("temp");
  db.temperatures.push({
    id,
    stopId: stop.id,
    deliveryId: stop.kind === "DELIVERY" ? db.deliveries.find((item) => item.lotId === stop.lotId)?.id : undefined,
    driverId: manifest.driverId,
    manifestId: manifest.id,
    temperature: input.temperature,
    unit: input.unit,
    timestamp: ports.now(),
    latitude: input.latitude,
    longitude: input.longitude,
    syncStatus: input.offline ? "PENDING" : "SYNCED",
    idempotencyKey: input.idempotencyKey,
  });
  if (input.offline) {
    enqueue(db, ports, user.id, {
      entityType: "TemperatureRecord",
      entityId: id,
      action: "TEMPERATURE",
      idempotencyKey: input.idempotencyKey,
      payload: { temperatureId: id },
    });
    return { db, data: { id }, message: OFFLINE_MESSAGE };
  }
  audit(db, ports, user, "TEMPERATURE_RECORDED", "TemperatureRecord", id, undefined, String(input.temperature));
  return { db, data: { id }, message: "Temperature recorded." };
}

export async function arriveAtStop(
  source: AppDatabase,
  ports: Ports,
  userId: string,
  stopId: string,
  location?: { latitude: number; longitude: number },
): Promise<CommandResult<{ stopId: string }>> {
  const db = begin(source);
  const user = actor(db, userId);
  requireRole(user, ["driver", "ops"], "Only the driver can mark arrival.");
  const stop = must(db.stops.find((item) => item.id === stopId), "Stop was not found.");
  const manifest = must(db.manifests.find((item) => item.id === stop.manifestId), "Manifest was not found.");
  if (user.role === "driver" && driverForUser(db, user.id).id !== manifest.driverId) {
    throw new AppError("FORBIDDEN", "This route is assigned to another driver.");
  }
  if (stop.status === "PENDING" || stop.status === "IN_TRANSIT") {
    stop.status = "ARRIVED";
    stop.arrivedAt = ports.now();
  }
  if (location) {
    stop.latitude = location.latitude;
    stop.longitude = location.longitude;
  }
  audit(db, ports, user, "STOP_ARRIVED", "RouteStop", stop.id, undefined, "ARRIVED");
  return { db, data: { stopId } };
}

export async function postLocationPing(
  source: AppDatabase,
  ports: Ports,
  userId: string,
  input: { manifestId: string; latitude: number; longitude: number; idempotencyKey: string; offline: boolean },
): Promise<CommandResult<{ id: string }>> {
  const db = begin(source);
  const user = actor(db, userId);
  requireRole(user, ["driver"], "Only a driver can post a position.");
  const driver = driverForUser(db, user.id);
  const manifest = must(db.manifests.find((item) => item.id === input.manifestId), "Manifest was not found.");
  if (manifest.driverId !== driver.id) throw new AppError("FORBIDDEN", "This manifest is assigned to another driver.");
  if (!driver.vehicleId && manifest.vehicleId) {
    driver.vehicleId = manifest.vehicleId;
  }
  const existing = db.locationPings.find((item) => item.idempotencyKey === input.idempotencyKey);
  if (existing) return { db: source, data: { id: existing.id } };
  const id = ports.id("ping");
  db.locationPings.push({
    id,
    driverId: driver.id,
    vehicleId: manifest.vehicleId,
    manifestId: manifest.id,
    latitude: input.latitude,
    longitude: input.longitude,
    timestamp: ports.now(),
    syncStatus: input.offline ? "PENDING" : "SYNCED",
    idempotencyKey: input.idempotencyKey,
  });
  if (!input.offline) {
    await ports.tracking.recordPing({
      latitude: input.latitude,
      longitude: input.longitude,
      timestamp: ports.now(),
      driverId: driver.id,
      vehicleId: manifest.vehicleId,
      manifestId: manifest.id,
    });
  } else {
    enqueue(db, ports, user.id, {
      entityType: "LocationPing",
      entityId: id,
      action: "LOCATION_PING",
      idempotencyKey: input.idempotencyKey,
      payload: { pingId: id },
    });
  }
  return { db, data: { id }, message: input.offline ? OFFLINE_MESSAGE : "Position shared." };
}

export async function flushSync(
  source: AppDatabase,
  ports: Ports,
  userId: string,
): Promise<CommandResult<{ synced: number; failed: number }>> {
  const db = begin(source);
  const user = actor(db, userId);
  let synced = 0;
  let failed = 0;
  const mine = db.syncQueue.filter(
    (item) => (item.actorId === user.id || user.role === "ops") && (item.syncStatus === "PENDING" || item.syncStatus === "FAILED"),
  );
  for (const item of mine) {
    try {
      await applyQueueItem(db, ports, item);
      item.syncStatus = "SYNCED";
      item.lastError = undefined;
      synced += 1;
    } catch (error) {
      const message = error instanceof AppError ? error.message : "Sync failed.";
      if (error instanceof AppError && error.code === "CONFLICT") {
        item.syncStatus = "CONFLICT";
      } else {
        item.syncStatus = "FAILED";
        item.retryCount += 1;
      }
      item.lastError = `${SYNC_RETRY_MESSAGE} ${message}`;
      failed += 1;
      logEvent("error", "sync_failed", { action: item.action, code: error instanceof AppError ? error.code : "UNKNOWN" });
    }
  }
  return {
    db,
    data: { synced, failed },
    message: failed > 0 ? SYNC_RETRY_MESSAGE : synced > 0 ? "Changes synchronised." : "Nothing waiting to sync.",
  };
}

async function applyQueueItem(db: AppDatabase, ports: Ports, item: SyncQueueItem): Promise<void> {
  if (item.action === "RECORD_INSPECTION") {
    const inspection = must(db.inspections.find((row) => row.id === String(item.payload.inspectionId)), "Queued inspection was not found.");
    await promoteInspection(db, ports, item.actorId, inspection, String(item.payload.scaleRef ?? ""));
    return;
  }
  if (item.action === "COLLECTION_STAMP") {
    const latitude = typeof item.payload.latitude === "number" ? item.payload.latitude : undefined;
    const longitude = typeof item.payload.longitude === "number" ? item.payload.longitude : undefined;
    applyCollection(db, ports, item.actorId, String(item.payload.stopId), latitude, longitude);
    return;
  }
  if (item.action === "DELIVERY_STAMP") {
    await applyDelivery(db, ports, item.actorId, String(item.payload.proofId), String(item.payload.stopId));
    return;
  }
  if (item.action === "TEMPERATURE") {
    const temperature = db.temperatures.find((row) => row.id === String(item.payload.temperatureId));
    if (temperature) temperature.syncStatus = "SYNCED";
    return;
  }
  if (item.action === "LOCATION_PING") {
    const ping = db.locationPings.find((row) => row.id === String(item.payload.pingId));
    if (ping) {
      ping.syncStatus = "SYNCED";
      await ports.tracking.recordPing(ping);
    }
  }
}

function enqueue(
  db: AppDatabase,
  ports: Ports,
  actorId: string,
  input: { entityType: string; entityId: string; action: string; idempotencyKey: string; payload: Record<string, unknown> },
): void {
  if (db.syncQueue.some((item) => item.idempotencyKey === input.idempotencyKey && item.syncStatus !== "SYNCED")) return;
  db.syncQueue.push({
    id: ports.id("sync"),
    entityType: input.entityType,
    entityId: input.entityId,
    action: input.action,
    payload: input.payload,
    createdAt: ports.now(),
    retryCount: 0,
    syncStatus: "PENDING",
    idempotencyKey: input.idempotencyKey,
    actorId,
  });
}

function validateQuantities(actual: number, rejected: number): void {
  if (!Number.isFinite(actual) || actual < 0) throw new AppError("INVALID_AMOUNT", "Enter the actual quantity.");
  if (!Number.isFinite(rejected) || rejected < 0) throw new AppError("INVALID_AMOUNT", "Rejected quantity cannot be negative.");
  if (rejected > actual) throw new AppError("INVALID_AMOUNT", "Rejected quantity cannot exceed the actual quantity.");
}

function gradeFor(db: AppDatabase, produceId: string, code: string): GradeOption {
  const scale = must(db.gradeScales.find((item) => item.produceId === produceId), "No grading scale is configured for this produce.");
  const grade = scale.grades.find((item) => item.code.toLowerCase() === code.trim().toLowerCase());
  if (!grade) {
    throw new AppError("INVALID_GRADE", `Grade ${code} is not configured for this produce. Use ${scale.grades.map((item) => item.code).join(", ")}.`);
  }
  return grade;
}

function qualityFor(actual: number, rejected: number, acceptable: boolean): FieldInspection["qualityStatus"] {
  if (!acceptable || (actual > 0 && rejected >= actual)) return "REJECTED";
  if (rejected > 0) return "PARTIAL";
  return "ACCEPTED";
}

function roundQuantity(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function escrowIsFunded(db: AppDatabase, lotId: string): boolean {
  const commitment = db.commitments.find((item) => item.lotId === lotId);
  if (!commitment) return false;
  return db.escrows.some((item) => item.commitmentId === commitment.id && item.status === "FUNDED");
}
