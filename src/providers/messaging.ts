import { AppError } from "../domain/errors";
import type { SMSProvider, SmsSendInput, SmsSendResult, TrackingPing, TrackingProvider, ObjectStorage } from "./types";

export class MockSmsProvider implements SMSProvider {
  readonly name = "mock";
  readonly sent: SmsSendInput[] = [];
  private readonly results = new Map<string, SmsSendResult>();
  private sequence = 0;

  async send(input: SmsSendInput): Promise<SmsSendResult> {
    const existing = this.results.get(input.idempotencyKey);
    if (existing) return existing;
    this.sent.push(input);
    this.sequence += 1;
    const result: SmsSendResult = {
      providerMessageId: `SMS-MOCK-${this.sequence}`,
      status: "sent",
    };
    this.results.set(input.idempotencyKey, result);
    return result;
  }
}

export class ConfiguredSmsProvider implements SMSProvider {
  readonly name: string;

  constructor(
    name: string,
    private readonly apiKey: string | undefined,
  ) {
    this.name = name;
  }

  async send(_input: SmsSendInput): Promise<SmsSendResult> {
    if (!this.apiKey) {
      throw new AppError(
        "PROVIDER_NOT_CONFIGURED",
        `${this.name} SMS is not configured. Set SMS_API_KEY or use the mock provider.`,
      );
    }
    throw new AppError(
      "PROVIDER_NOT_IMPLEMENTED",
      `${this.name} SMS is selected, but no live aggregator API is called until official documentation is available.`,
    );
  }
}

export class MockTrackingProvider implements TrackingProvider {
  readonly name = "phone";
  readonly pings: TrackingPing[] = [];

  async recordPing(ping: TrackingPing): Promise<void> {
    this.pings.push(ping);
  }
}

export class MockObjectStorage implements ObjectStorage {
  readonly name = "mock-storage";

  async put(input: { localUri: string; path: string }): Promise<{ url: string }> {
    return { url: `mock-storage://${input.path}` };
  }
}
