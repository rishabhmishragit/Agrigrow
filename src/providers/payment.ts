import { AppError } from "../domain/errors";
import type { PaymentProvider, PayoutRequest, PayoutResult } from "./types";

export class MockPaymentProvider implements PaymentProvider {
  readonly name = "mock";
  readonly calls: PayoutRequest[] = [];
  private readonly results = new Map<string, PayoutResult>();
  private sequence = 0;
  failNext = false;

  async initiatePayout(input: PayoutRequest): Promise<PayoutResult> {
    const existing = this.results.get(input.idempotencyKey);
    if (existing) return existing;
    this.calls.push(input);
    this.sequence += 1;
    const failed = this.failNext;
    this.failNext = false;
    const result: PayoutResult = {
      provider: this.name,
      externalReference: `PAY-MOCK-${this.sequence}`,
      status: failed ? "FAILED" : "PAID",
      failureReason: failed ? "Mock provider declined the payout." : undefined,
    };
    this.results.set(input.idempotencyKey, result);
    return result;
  }

  async getPayoutStatus(externalReference: string): Promise<PayoutResult["status"]> {
    const found = [...this.results.values()].find((item) => item.externalReference === externalReference);
    if (!found) throw new AppError("NOT_FOUND", "Payout reference was not found at the payment provider.");
    return found.status;
  }

  async verifyTransaction(externalReference: string): Promise<PayoutResult["status"]> {
    return this.getPayoutStatus(externalReference);
  }
}

/** Live adapter shell. No vendor URL is called until official credentials and docs exist. */
export class ConfiguredPaymentProvider implements PaymentProvider {
  readonly name: string;

  constructor(
    name: string,
    private readonly apiKey: string | undefined,
  ) {
    this.name = name;
  }

  private unavailable(): never {
    if (!this.apiKey) {
      throw new AppError(
        "PROVIDER_NOT_CONFIGURED",
        `${this.name} is not configured. Set PAYMENT_API_KEY or use the mock provider.`,
      );
    }
    throw new AppError(
      "PROVIDER_NOT_IMPLEMENTED",
      `${this.name} is selected, but the live API is not called until official credentials and documentation are available.`,
    );
  }

  async initiatePayout(_input: PayoutRequest): Promise<PayoutResult> {
    this.unavailable();
  }

  async getPayoutStatus(_externalReference: string): Promise<PayoutResult["status"]> {
    this.unavailable();
  }

  async verifyTransaction(_externalReference: string): Promise<PayoutResult["status"]> {
    this.unavailable();
  }
}
