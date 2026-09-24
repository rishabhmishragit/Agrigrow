export interface PayoutRequest {
  idempotencyKey: string;
  amountGhs: number;
  currency: "GHS";
  phone: string;
  narration: string;
  consignmentId: string;
  settlementId: string;
}

export interface PayoutResult {
  provider: string;
  externalReference: string;
  status: "PENDING" | "PROCESSING" | "PAID" | "FAILED";
  failureReason?: string;
}

export interface PaymentProvider {
  readonly name: string;
  initiatePayout(input: PayoutRequest): Promise<PayoutResult>;
  getPayoutStatus(externalReference: string): Promise<PayoutResult["status"]>;
  verifyTransaction(externalReference: string): Promise<PayoutResult["status"]>;
}

export interface CreateEscrowInput {
  commitmentId: string;
  instructedAmountGhs: number;
  currency: "GHS";
  bankLabel: string;
  idempotencyKey: string;
}

export interface EscrowProviderStatus {
  provider: string;
  externalReference: string;
  status: "PENDING" | "FUNDED" | "RELEASE_REQUESTED" | "RELEASED" | "FAILED";
  externalTransactionRef?: string;
}

export interface EscrowProvider {
  readonly name: string;
  createEscrowReference(input: CreateEscrowInput): Promise<EscrowProviderStatus>;
  getEscrowStatus(externalReference: string): Promise<EscrowProviderStatus>;
  verifyFunding(externalReference: string): Promise<EscrowProviderStatus>;
  requestRelease(input: {
    externalReference: string;
    idempotencyKey: string;
  }): Promise<EscrowProviderStatus>;
  getReleaseStatus(externalReference: string): Promise<EscrowProviderStatus>;
}

export interface SmsSendInput {
  to: string;
  body: string;
  idempotencyKey: string;
}

export interface SmsSendResult {
  providerMessageId: string;
  status: "queued" | "sent" | "failed";
}

export interface SMSProvider {
  readonly name: string;
  send(input: SmsSendInput): Promise<SmsSendResult>;
}

export interface UssdReply {
  response: string;
  end: boolean;
}

export interface USSDProvider {
  readonly name: string;
  startSession(input: { phone: string; sessionId: string }): Promise<UssdReply>;
  handleInput(input: { sessionId: string; text: string }): Promise<UssdReply>;
  endSession(sessionId: string): Promise<void>;
}

export interface TrackingPing {
  latitude: number;
  longitude: number;
  timestamp: string;
  driverId: string;
  vehicleId: string;
  manifestId: string;
}

export interface TrackingProvider {
  readonly name: string;
  recordPing(ping: TrackingPing): Promise<void>;
}

export interface ObjectStorage {
  readonly name: string;
  put(input: { localUri: string; path: string }): Promise<{ url: string }>;
}
