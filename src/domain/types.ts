export type Role = "farmer" | "offtaker" | "field_agent" | "driver" | "ops";

export type ListingStatus =
  | "DRAFT"
  | "AVAILABLE"
  | "ALLOCATED"
  | "SCHEDULED"
  | "COLLECTED"
  | "SETTLED"
  | "CANCELLED";

export type OrderState =
  | "LISTED"
  | "AGGREGATING"
  | "LOT_CREATED"
  | "COMMITTED"
  | "ESCROW_PENDING"
  | "ESCROW_FUNDED"
  | "COLLECTION_SCHEDULED"
  | "FIELD_CONFIRMED"
  | "COLLECTED"
  | "IN_TRANSIT"
  | "DELIVERED"
  | "ACCEPTED"
  | "ESCROW_RELEASE_REQUESTED"
  | "ESCROW_RELEASED"
  | "SETTLEMENT_PROCESSING"
  | "SETTLED"
  | "EXCEPTION"
  | "CANCELLED";

export type LotStatus = "DRAFT" | "PUBLISHED" | "COMMITTED" | "CLOSED" | "CANCELLED";

export type RequirementStatus = "DRAFT" | "ACTIVE" | "FULFILLED" | "CANCELLED";

export type EscrowStatus =
  | "PENDING"
  | "FUNDED"
  | "RELEASE_REQUESTED"
  | "RELEASED"
  | "FAILED"
  | "CANCELLED";

export type StopStatus =
  | "PENDING"
  | "ARRIVED"
  | "COLLECTED"
  | "IN_TRANSIT"
  | "DELIVERED"
  | "EXCEPTION";

export type StopKind = "COLLECTION" | "DELIVERY";

export type ExceptionStatus = "OPEN" | "ASSIGNED" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";

export type SyncStatus = "PENDING" | "SYNCED" | "FAILED" | "CONFLICT";

export type PaymentStatus = "PENDING" | "PROCESSING" | "PAID" | "FAILED";

export type SettlementStatus = "PENDING" | "PROCESSING" | "PAID" | "FAILED";

export type NotificationChannel = "in_app" | "push" | "sms";

export interface User {
  id: string;
  role: Role;
  fullName: string;
  phone: string;
  email: string;
  location: string;
  active: boolean;
  createdAt: string;
}

export type ProduceCategory = "fruit" | "vegetables" | "meat" | "fish" | "dairy";
export type BuyerSeat = "requester" | "approver" | "admin";
export type MomoNetwork = "MTN" | "Telecel" | "AirtelTigo";
export type WalletTier = "bronze" | "silver" | "gold";
export type TempCheckpoint = "load" | "farm_stop" | "depart_last" | "arrival" | "handover";
export type BuyerOrderStatus = "SUBMITTED" | "AWAITING_PAYMENT" | "PAID" | "ALLOCATED" | "IN_FULFILMENT" | "DELIVERED" | "ACCEPTED" | "CANCELLED";
export type BuyerPaymentStatus = "UNPAID" | "PENDING" | "PAID" | "FAILED";

export interface FarmerProfile {
  id: string;
  userId: string;
  village: string;
  community: string;
  farmInfo?: string;
  produceIds: string[];
  phoneVerified: boolean;
  locationLabel: string;
  latitude?: number;
  longitude?: number;
  momoNumber?: string;
  momoNetwork?: MomoNetwork;
  walletTier?: WalletTier;
  consentAt?: string;
}

export interface OfftakerProfile {
  id: string;
  userId: string;
  organization: string;
  deliveryLocation: string;
  latitude?: number;
  longitude?: number;
  buyerSeat?: BuyerSeat;
  paymentLimitGhs?: number;
}

export interface FieldAgentProfile {
  id: string;
  userId: string;
  baseLocation: string;
  assignedArea: string;
}

export interface DriverProfile {
  id: string;
  userId: string;
  licenseRef: string;
  vehicleId?: string;
}

export interface Vehicle {
  id: string;
  plate: string;
  type: string;
  coldCapable: boolean;
  ownerLabel: string;
}

export interface GradeOption {
  code: string;
  label: string;
  acceptable: boolean;
}

export interface Produce {
  id: string;
  name: string;
  defaultUnit: string;
  category?: ProduceCategory;
  pricePerKg?: number;
  temperatureMinC?: number;
  temperatureMaxC?: number;
}

export interface GradeScale {
  id: string;
  produceId: string;
  grades: GradeOption[];
}

export interface ProduceListing {
  id: string;
  farmerId: string;
  produceId: string;
  quantity: number;
  unit: string;
  availableDate: string;
  pickupLocation: string;
  latitude?: number;
  longitude?: number;
  notes?: string;
  status: ListingStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Consignment {
  id: string;
  lotId: string;
  listingId: string;
  farmerId: string;
  produceId: string;
  expectedQuantity: number;
  unit: string;
  agreedPricePerUnit: number;
  confirmedWeight?: number;
  acceptedWeight?: number;
  gradeCode?: string;
  collectionStopId?: string;
  bookingAccepted: boolean;
  status: ListingStatus;
}

export interface Lot {
  id: string;
  code: string;
  produceId: string;
  origin: string;
  destination: string;
  gradeExpectation: string;
  pricePerUnit: number;
  collectionFeePerStop: number;
  otherCharges: number;
  status: LotStatus;
  orderState: OrderState;
  stateBeforeException?: OrderState;
  publishedAt?: string;
  createdBy: string;
  notes?: string;
  deliveryWindowStart: string;
  deliveryWindowEnd: string;
  createdAt: string;
}

export interface StandingRequirement {
  id: string;
  offtakerId: string;
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
  status: RequirementStatus;
  createdAt: string;
}

export interface Commitment {
  id: string;
  lotId: string;
  offtakerId: string;
  orderState: OrderState;
  stateBeforeException?: OrderState;
  createdAt: string;
  acceptedAt?: string;
}

/**
 * External escrow reference. Amounts here are funding instructions for the
 * bank trust account. The application does not store a balance or wallet.
 */
export interface Escrow {
  id: string;
  commitmentId: string;
  provider: string;
  bankLabel: string;
  externalReference: string;
  status: EscrowStatus;
  instructedAmountGhs: number;
  externalTransactionRef?: string;
  fundedAt?: string;
  releaseRequestedAt?: string;
  releasedAt?: string;
  releaseIdempotencyKey?: string;
  createdAt: string;
}

export interface Collection {
  id: string;
  lotId: string;
  commitmentId: string;
  fieldAgentId: string;
  scheduledDate: string;
  windowLabel: string;
  status: string;
}

export interface RouteStop {
  id: string;
  kind: StopKind;
  collectionId?: string;
  manifestId?: string;
  lotId: string;
  location: string;
  latitude?: number;
  longitude?: number;
  windowLabel: string;
  collectionFee: number;
  consignmentIds: string[];
  status: StopStatus;
  sequence: number;
  arrivedAt?: string;
  departedAt?: string;
  completedAt?: string;
}

export interface FieldInspection {
  id: string;
  consignmentId: string;
  collectionId: string;
  agentId: string;
  expectedQuantity: number;
  actualQuantity: number;
  rejectedQuantity: number;
  acceptedQuantity: number;
  gradeCode: string;
  qualityStatus: "ACCEPTED" | "PARTIAL" | "REJECTED";
  notes?: string;
  photoUris: string[];
  identityPhotoUri?: string;
  cratePhotoUri?: string;
  scalePhotoUri?: string;
  timePicked?: string;
  coldBoxAt?: string;
  locked?: boolean;
  declined?: boolean;
  declineReason?: string;
  latitude?: number;
  longitude?: number;
  recordedAt: string;
  syncStatus: SyncStatus;
  idempotencyKey: string;
}

export interface Grade {
  id: string;
  inspectionId: string;
  consignmentId: string;
  code: string;
  scaleId: string;
  recordedAt: string;
}

export interface WeightRecord {
  id: string;
  inspectionId: string;
  consignmentId: string;
  expectedWeight: number;
  actualWeight: number;
  unit: string;
  scaleRef?: string;
  recordedAt: string;
  agentId: string;
  latitude?: number;
  longitude?: number;
}

export interface Manifest {
  id: string;
  code: string;
  driverId: string;
  vehicleId: string;
  date: string;
  routeLabel: string;
  destination: string;
  status: string;
  commitmentIds: string[];
  lotIds: string[];
}

export interface Delivery {
  id: string;
  commitmentId: string;
  lotId: string;
  manifestId?: string;
  stopId?: string;
  location: string;
  status: StopStatus;
  arrivedAt?: string;
  deliveredAt?: string;
  syncStatus: SyncStatus;
}

export interface ProofOfDelivery {
  id: string;
  deliveryId: string;
  photoUris: string[];
  receiverName: string;
  signatureName: string;
  notes?: string;
  timestamp: string;
  latitude?: number;
  longitude?: number;
  driverId: string;
  syncStatus: SyncStatus;
  idempotencyKey: string;
  lines?: Array<{ consignmentId: string; acceptedKg: number; rejectedKg: number; reason?: string }>;
}

export interface TemperatureRecord {
  id: string;
  stopId?: string;
  deliveryId?: string;
  driverId: string;
  manifestId?: string;
  temperature: number;
  unit: "C" | "F";
  timestamp: string;
  latitude?: number;
  longitude?: number;
  checkpoint?: TempCheckpoint;
  gaugePhotoUri?: string;
  outOfRange?: boolean;
  syncStatus: SyncStatus;
  idempotencyKey: string;
}

export interface LocationPing {
  id: string;
  driverId: string;
  vehicleId: string;
  manifestId: string;
  latitude: number;
  longitude: number;
  timestamp: string;
  syncStatus: SyncStatus;
  idempotencyKey: string;
}

export interface Settlement {
  id: string;
  consignmentId: string;
  farmerId: string;
  commitmentId: string;
  grossValue: number;
  collectionFee: number;
  otherDeductions: number;
  netSettlement: number;
  feeCapped: boolean;
  status: SettlementStatus;
  calculatedAt: string;
  paidAt?: string;
  paymentReference?: string;
}

export interface Payment {
  id: string;
  settlementId: string;
  consignmentId: string;
  provider: string;
  amountGhs: number;
  currency: "GHS";
  status: PaymentStatus;
  externalReference?: string;
  idempotencyKey: string;
  createdAt: string;
  paidAt?: string;
  failureReason?: string;
}

export interface AppNotification {
  id: string;
  userId: string;
  channel: NotificationChannel;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
  entityType?: string;
  entityId?: string;
}

export interface SMSMessage {
  id: string;
  to: string;
  body: string;
  status: "queued" | "sent" | "failed";
  provider: string;
  providerMessageId?: string;
  idempotencyKey: string;
  createdAt: string;
  event: string;
  userId?: string;
}

export interface USSDSession {
  id: string;
  phone: string;
  menu: string;
  context: Record<string, string>;
  ended: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface OpsException {
  id: string;
  type: string;
  severity: "LOW" | "MEDIUM" | "HIGH";
  entityType: string;
  entityId: string;
  description: string;
  createdBy: string;
  assignedTo?: string;
  status: ExceptionStatus;
  resolution?: string;
  createdAt: string;
  resolvedAt?: string;
}

export interface AuditLog {
  id: string;
  actorId: string;
  role: Role;
  action: string;
  entity: string;
  entityId: string;
  previousState?: string;
  newState?: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface SyncQueueItem {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  payload: Record<string, unknown>;
  createdAt: string;
  retryCount: number;
  syncStatus: SyncStatus;
  lastError?: string;
  idempotencyKey: string;
  actorId: string;
}

export interface IdempotencyRecord {
  key: string;
  operation: string;
  entityId: string;
  createdAt: string;
}

export interface OtpChallenge {
  id: string;
  phone: string;
  code: string;
  expiresAt: string;
  consumed: boolean;
}

export interface BuyerOrder {
  id: string;
  offtakerId: string;
  produceId: string;
  quantityKg: number;
  deliveryDate: string;
  pricePerKg: number;
  totalGhs: number;
  orderStatus: BuyerOrderStatus;
  paymentStatus: BuyerPaymentStatus;
  submittedBy: string;
  paidBy?: string;
  lotId?: string;
  createdAt: string;
}

export interface PayoutRun {
  id: string;
  settlementIds: string[];
  raisedBy: string;
  approvals: string[];
  status: "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "PAID";
  totalGhs: number;
  createdAt: string;
  dueAt: string;
}

export interface OpsConfig {
  payoutApprovalThresholdGhs: number;
  payoutApproverIds: string[];
  temperatureMinC: number;
  temperatureMaxC: number;
  checkpoints: TempCheckpoint[];
}

export interface AppDatabase {
  version: 1;
  buyerOrders: BuyerOrder[];
  payoutRuns: PayoutRun[];
  opsConfig: OpsConfig;
  users: User[];
  farmerProfiles: FarmerProfile[];
  offtakerProfiles: OfftakerProfile[];
  fieldAgentProfiles: FieldAgentProfile[];
  driverProfiles: DriverProfile[];
  vehicles: Vehicle[];
  produce: Produce[];
  gradeScales: GradeScale[];
  listings: ProduceListing[];
  consignments: Consignment[];
  lots: Lot[];
  standingRequirements: StandingRequirement[];
  commitments: Commitment[];
  escrows: Escrow[];
  collections: Collection[];
  stops: RouteStop[];
  inspections: FieldInspection[];
  grades: Grade[];
  weights: WeightRecord[];
  manifests: Manifest[];
  deliveries: Delivery[];
  proofs: ProofOfDelivery[];
  temperatures: TemperatureRecord[];
  locationPings: LocationPing[];
  payments: Payment[];
  settlements: Settlement[];
  notifications: AppNotification[];
  smsMessages: SMSMessage[];
  ussdSessions: USSDSession[];
  exceptions: OpsException[];
  auditLogs: AuditLog[];
  syncQueue: SyncQueueItem[];
  idempotency: IdempotencyRecord[];
  otpChallenges: OtpChallenge[];
}
