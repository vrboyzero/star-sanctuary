import type {
  EmailInboundProviderId,
  NormalizedEmailInboundEvent,
  NormalizeEmailInboundEventResult,
} from "./email-inbound-contract.js";

export type EmailInboundProviderAdapter = {
  readonly providerId: EmailInboundProviderId;
  normalizeInboundEvent(input: {
    accountId: string;
    raw: unknown;
  }): Promise<NormalizeEmailInboundEventResult> | NormalizeEmailInboundEventResult;
};

export type EmailInboundRegistryNormalizeResult =
  | {
    ok: true;
    value: NormalizedEmailInboundEvent;
  }
  | {
    ok: false;
    providerId?: EmailInboundProviderId;
    code: "invalid_event" | "provider_unavailable";
    message: string;
    issues?: string[];
  };

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export class EmailInboundProviderRegistry {
  private readonly providers = new Map<EmailInboundProviderId, EmailInboundProviderAdapter>();
  private defaultProviderId?: EmailInboundProviderId;

  register(provider: EmailInboundProviderAdapter, options: { makeDefault?: boolean } = {}): void {
    const providerId = normalizeString(provider?.providerId);
    if (!providerId) {
      throw new Error("providerId is required");
    }
    this.providers.set(providerId, provider);
    if (options.makeDefault || !this.defaultProviderId) {
      this.defaultProviderId = providerId;
    }
  }

  unregister(providerId: EmailInboundProviderId): void {
    const normalizedProviderId = normalizeString(providerId);
    if (!normalizedProviderId) {
      return;
    }
    this.providers.delete(normalizedProviderId);
    if (this.defaultProviderId === normalizedProviderId) {
      this.defaultProviderId = this.providers.keys().next().value;
    }
  }

  get(providerId: EmailInboundProviderId): EmailInboundProviderAdapter | undefined {
    return this.providers.get(normalizeString(providerId));
  }

  has(providerId: EmailInboundProviderId): boolean {
    return this.providers.has(normalizeString(providerId));
  }

  listProviderIds(): EmailInboundProviderId[] {
    return Array.from(this.providers.keys());
  }

  getDefaultProviderId(): EmailInboundProviderId | undefined {
    return this.defaultProviderId;
  }

  setDefaultProviderId(providerId: EmailInboundProviderId): void {
    const normalizedProviderId = normalizeString(providerId);
    if (!normalizedProviderId || !this.providers.has(normalizedProviderId)) {
      throw new Error(`provider not registered: ${providerId}`);
    }
    this.defaultProviderId = normalizedProviderId;
  }

  private resolveProviderId(explicitProviderId?: string): EmailInboundProviderId | undefined {
    const explicit = normalizeString(explicitProviderId);
    if (explicit) {
      return explicit;
    }
    if (this.defaultProviderId) {
      return this.defaultProviderId;
    }
    if (this.providers.size === 1) {
      return this.providers.keys().next().value;
    }
    return undefined;
  }

  async normalizeInboundEvent(input: {
    providerId?: EmailInboundProviderId;
    accountId: string;
    raw: unknown;
  }): Promise<EmailInboundRegistryNormalizeResult> {
    const providerId = this.resolveProviderId(input.providerId);
    if (!providerId) {
      return {
        ok: false,
        code: "provider_unavailable",
        message: "No email inbound provider is available.",
      };
    }

    const provider = this.providers.get(providerId);
    if (!provider) {
      return {
        ok: false,
        providerId,
        code: "provider_unavailable",
        message: `Email inbound provider is not registered: ${providerId}`,
      };
    }

    const normalized = await provider.normalizeInboundEvent({
      accountId: normalizeString(input.accountId),
      raw: input.raw,
    });
    if (!normalized.ok) {
      return {
        ok: false,
        providerId,
        code: normalized.code,
        message: normalized.message,
        issues: normalized.issues,
      };
    }

    return {
      ok: true,
      value: normalized.value,
    };
  }
}
