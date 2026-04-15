import type { NormalizedEmailOutboundDraft } from "./email-outbound-contract.js";

export type PendingEmailOutboundRequest = {
  requestId: string;
  conversationId: string;
  requestedByAgentId?: string;
  draft: NormalizedEmailOutboundDraft;
  createdAt: number;
  expiresAt: number;
};

const DEFAULT_TTL_MS = 10 * 60 * 1000;

export class EmailOutboundConfirmationStore {
  private readonly requests = new Map<string, PendingEmailOutboundRequest>();
  private readonly ttlMs: number;

  constructor(ttlMs = DEFAULT_TTL_MS) {
    this.ttlMs = ttlMs;
  }

  create(
    request: Omit<PendingEmailOutboundRequest, "createdAt" | "expiresAt">,
  ): PendingEmailOutboundRequest {
    this.cleanupExpired();
    const createdAt = Date.now();
    const stored: PendingEmailOutboundRequest = {
      ...request,
      createdAt,
      expiresAt: createdAt + this.ttlMs,
    };
    this.requests.set(stored.requestId, stored);
    return stored;
  }

  get(requestId: string): PendingEmailOutboundRequest | undefined {
    this.cleanupExpired();
    return this.requests.get(requestId);
  }

  delete(requestId: string): void {
    this.requests.delete(requestId);
  }

  cleanupExpired(now = Date.now()): void {
    for (const [requestId, request] of this.requests.entries()) {
      if (request.expiresAt <= now) {
        this.requests.delete(requestId);
      }
    }
  }
}
