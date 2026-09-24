import { AppError } from "../domain/errors";
import type { CreateEscrowInput, EscrowProvider, EscrowProviderStatus } from "./types";

export class MockEscrowProvider implements EscrowProvider {
  readonly name = "mock";
  releaseCalls = 0;
  private sequence = 0;
  private readonly records = new Map<string, EscrowProviderStatus>();
  private readonly funded = new Set<string>();
  private readonly releases = new Map<string, EscrowProviderStatus>();

  simulateBankFunding(externalReference: string, transactionRef = "BANK-TX-DEMO"): void {
    this.funded.add(externalReference);
    const current = this.records.get(externalReference);
    if (current) {
      current.status = "FUNDED";
      current.externalTransactionRef = transactionRef;
    }
  }

  async createEscrowReference(input: CreateEscrowInput): Promise<EscrowProviderStatus> {
    const existing = [...this.records.values()].find((item) =>
      item.externalReference.endsWith(input.idempotencyKey),
    );
    if (existing) return existing;
    this.sequence += 1;
    const status: EscrowProviderStatus = {
      provider: this.name,
      externalReference: `ESC-MOCK-${this.sequence}`,
      status: "PENDING",
    };
    this.records.set(status.externalReference, status);
    return status;
  }

  async getEscrowStatus(externalReference: string): Promise<EscrowProviderStatus> {
    const found = this.records.get(externalReference);
    if (!found) throw new AppError("NOT_FOUND", "Escrow reference was not found at the external provider.");
    return found;
  }

  async verifyFunding(externalReference: string): Promise<EscrowProviderStatus> {
    const found = await this.getEscrowStatus(externalReference);
    if (this.funded.has(externalReference)) {
      found.status = "FUNDED";
      found.externalTransactionRef = found.externalTransactionRef ?? "BANK-TX-DEMO";
    }
    return found;
  }

  async requestRelease(input: {
    externalReference: string;
    idempotencyKey: string;
  }): Promise<EscrowProviderStatus> {
    const existing = this.releases.get(input.idempotencyKey);
    if (existing) return existing;
    this.releaseCalls += 1;
    const found = await this.getEscrowStatus(input.externalReference);
    found.status = "RELEASED";
    this.releases.set(input.idempotencyKey, { ...found });
    return found;
  }

  async getReleaseStatus(externalReference: string): Promise<EscrowProviderStatus> {
    return this.getEscrowStatus(externalReference);
  }
}

export class ConfiguredEscrowProvider implements EscrowProvider {
  readonly name: string;

  constructor(
    name: string,
    private readonly apiUrl: string | undefined,
  ) {
    this.name = name;
  }

  private unavailable(): never {
    if (!this.apiUrl) {
      throw new AppError(
        "PROVIDER_NOT_CONFIGURED",
        `${this.name} escrow is not configured. Set ESCROW_API_URL or use the mock provider. The trust-account bank is not hard-coded.`,
      );
    }
    throw new AppError(
      "PROVIDER_NOT_IMPLEMENTED",
      `${this.name} escrow is selected, but no live bank API is called until official documentation is available.`,
    );
  }

  async createEscrowReference(_input: CreateEscrowInput): Promise<EscrowProviderStatus> {
    this.unavailable();
  }

  async getEscrowStatus(_externalReference: string): Promise<EscrowProviderStatus> {
    this.unavailable();
  }

  async verifyFunding(_externalReference: string): Promise<EscrowProviderStatus> {
    this.unavailable();
  }

  async requestRelease(_input: {
    externalReference: string;
    idempotencyKey: string;
  }): Promise<EscrowProviderStatus> {
    this.unavailable();
  }

  async getReleaseStatus(_externalReference: string): Promise<EscrowProviderStatus> {
    this.unavailable();
  }
}
