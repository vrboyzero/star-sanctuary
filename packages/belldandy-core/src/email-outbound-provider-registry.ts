import {
  normalizeEmailOutboundDraft,
  type EmailOutboundDraft,
  type EmailOutboundProviderId,
  type NormalizedEmailOutboundDraft,
} from "./email-outbound-contract.js";

export type EmailOutboundSendContext = {
  conversationId?: string;
  requestedByAgentId?: string;
  traceId?: string;
};

export type EmailOutboundProviderSendResult =
  | {
    ok: true;
    providerId: EmailOutboundProviderId;
    providerMessageId?: string;
    providerThreadId?: string;
    acceptedAt?: number;
  }
  | {
    ok: false;
    providerId: EmailOutboundProviderId;
    code: "send_failed" | "provider_unavailable" | "invalid_provider_config";
    message: string;
    retryable?: boolean;
  };

export type EmailOutboundProvider = {
  readonly providerId: EmailOutboundProviderId;
  send(input: {
    draft: NormalizedEmailOutboundDraft;
    context?: EmailOutboundSendContext;
  }): Promise<EmailOutboundProviderSendResult>;
};

export type EmailOutboundRegistrySendResult =
  | {
    ok: true;
    providerId: EmailOutboundProviderId;
    draft: NormalizedEmailOutboundDraft;
    providerMessageId?: string;
    providerThreadId?: string;
    acceptedAt?: number;
  }
  | {
    ok: false;
    providerId?: EmailOutboundProviderId;
    code: "invalid_draft" | "provider_unavailable" | "send_failed" | "invalid_provider_config";
    message: string;
    issues?: string[];
    draft?: NormalizedEmailOutboundDraft;
    retryable?: boolean;
  };

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export class EmailOutboundProviderRegistry {
  private readonly providers = new Map<EmailOutboundProviderId, EmailOutboundProvider>();
  private defaultProviderId?: EmailOutboundProviderId;

  register(provider: EmailOutboundProvider, options: { makeDefault?: boolean } = {}): void {
    const providerId = normalizeString(provider?.providerId);
    if (!providerId) {
      throw new Error("providerId is required");
    }
    this.providers.set(providerId, provider);
    if (options.makeDefault || !this.defaultProviderId) {
      this.defaultProviderId = providerId;
    }
  }

  unregister(providerId: EmailOutboundProviderId): void {
    const normalizedProviderId = normalizeString(providerId);
    if (!normalizedProviderId) {
      return;
    }
    this.providers.delete(normalizedProviderId);
    if (this.defaultProviderId === normalizedProviderId) {
      this.defaultProviderId = this.providers.keys().next().value;
    }
  }

  has(providerId: EmailOutboundProviderId): boolean {
    return this.providers.has(normalizeString(providerId));
  }

  get(providerId: EmailOutboundProviderId): EmailOutboundProvider | undefined {
    return this.providers.get(normalizeString(providerId));
  }

  listProviderIds(): EmailOutboundProviderId[] {
    return Array.from(this.providers.keys());
  }

  getDefaultProviderId(): EmailOutboundProviderId | undefined {
    return this.defaultProviderId;
  }

  setDefaultProviderId(providerId: EmailOutboundProviderId): void {
    const normalizedProviderId = normalizeString(providerId);
    if (!normalizedProviderId || !this.providers.has(normalizedProviderId)) {
      throw new Error(`provider not registered: ${providerId}`);
    }
    this.defaultProviderId = normalizedProviderId;
  }

  private resolveProviderId(explicitProviderId?: string, draftProviderId?: string): EmailOutboundProviderId | undefined {
    const explicit = normalizeString(explicitProviderId);
    if (explicit) {
      return explicit;
    }
    const draftLevel = normalizeString(draftProviderId);
    if (draftLevel) {
      return draftLevel;
    }
    if (this.defaultProviderId) {
      return this.defaultProviderId;
    }
    if (this.providers.size === 1) {
      return this.providers.keys().next().value;
    }
    return undefined;
  }

  async send(input: {
    draft: EmailOutboundDraft;
    providerId?: EmailOutboundProviderId;
    context?: EmailOutboundSendContext;
  }): Promise<EmailOutboundRegistrySendResult> {
    const normalizedDraft = normalizeEmailOutboundDraft(input.draft);
    if (!normalizedDraft.ok) {
      return {
        ok: false,
        code: "invalid_draft",
        message: normalizedDraft.message,
        issues: normalizedDraft.issues,
      };
    }

    const providerId = this.resolveProviderId(input.providerId, normalizedDraft.value.providerId);
    if (!providerId) {
      return {
        ok: false,
        code: "provider_unavailable",
        message: "No email outbound provider is available.",
        draft: normalizedDraft.value,
      };
    }

    const provider = this.providers.get(providerId);
    if (!provider) {
      return {
        ok: false,
        providerId,
        code: "provider_unavailable",
        message: `Email outbound provider is not registered: ${providerId}`,
        draft: normalizedDraft.value,
      };
    }

    const sent = await provider.send({
      draft: normalizedDraft.value,
      context: input.context,
    });
    if (!sent.ok) {
      return {
        ok: false,
        providerId: sent.providerId,
        code: sent.code,
        message: sent.message,
        draft: normalizedDraft.value,
        ...(sent.retryable === true ? { retryable: true } : {}),
      };
    }

    return {
      ok: true,
      providerId: sent.providerId,
      draft: normalizedDraft.value,
      ...(normalizeString(sent.providerMessageId) ? { providerMessageId: normalizeString(sent.providerMessageId) } : {}),
      ...(normalizeString(sent.providerThreadId) ? { providerThreadId: normalizeString(sent.providerThreadId) } : {}),
      ...(Number.isFinite(sent.acceptedAt) ? { acceptedAt: Number(sent.acceptedAt) } : {}),
    };
  }
}
