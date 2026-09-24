import { ConfiguredEscrowProvider, MockEscrowProvider } from "./escrow";
import { ConfiguredPaymentProvider, MockPaymentProvider } from "./payment";
import { ConfiguredSmsProvider, MockObjectStorage, MockSmsProvider, MockTrackingProvider } from "./messaging";
import type { EscrowProvider, ObjectStorage, PaymentProvider, SMSProvider, TrackingProvider } from "./types";

export interface ProviderConfig {
  paymentProvider: string;
  paymentApiKey?: string;
  escrowProvider: string;
  escrowApiUrl?: string;
  escrowBankLabel: string;
  smsProvider: string;
  smsApiKey?: string;
  trackingProvider: string;
}

export interface ProviderSet {
  payment: PaymentProvider;
  escrow: EscrowProvider;
  sms: SMSProvider;
  tracking: TrackingProvider;
  storage: ObjectStorage;
}

export function createProviders(config: ProviderConfig): ProviderSet {
  return {
    payment: createPayment(config),
    escrow: createEscrow(config),
    sms: createSms(config),
    tracking: new MockTrackingProvider(),
    storage: new MockObjectStorage(),
  };
}

function createPayment(config: ProviderConfig): PaymentProvider {
  if (config.paymentProvider === "mock" || config.paymentProvider === "") {
    return new MockPaymentProvider();
  }
  return new ConfiguredPaymentProvider(config.paymentProvider, config.paymentApiKey);
}

function createEscrow(config: ProviderConfig): EscrowProvider {
  if (config.escrowProvider === "mock" || config.escrowProvider === "") {
    return new MockEscrowProvider();
  }
  return new ConfiguredEscrowProvider(config.escrowProvider, config.escrowApiUrl);
}

function createSms(config: ProviderConfig): SMSProvider {
  if (config.smsProvider === "mock" || config.smsProvider === "") {
    return new MockSmsProvider();
  }
  return new ConfiguredSmsProvider(config.smsProvider, config.smsApiKey);
}

export { MockEscrowProvider, MockPaymentProvider, MockSmsProvider };
