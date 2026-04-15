import type {
  ExternalOutboundChannel,
  ExternalOutboundResolutionMode,
} from "./external-outbound-sender-registry.js";

export type PendingExternalOutboundRequest = {
  requestId: string;
  conversationId: string;
  requestedByAgentId?: string;
  channel: ExternalOutboundChannel;
  content: string;
  sessionKey?: string;
  resolvedSessionKey: string;
  resolution: ExternalOutboundResolutionMode;
  targetChatId?: string;
  targetAccountId?: string;
  createdAt: number;
  expiresAt: number;
};

const DEFAULT_TTL_MS = 10 * 60 * 1000;

export class ExternalOutboundConfirmationStore {
  private readonly requests = new Map<string, PendingExternalOutboundRequest>();
  private readonly ttlMs: number;

  constructor(ttlMs = DEFAULT_TTL_MS) {
    this.ttlMs = ttlMs;
  }

  create(
    request: Omit<PendingExternalOutboundRequest, "createdAt" | "expiresAt">,
  ): PendingExternalOutboundRequest {
    this.cleanupExpired();
    const createdAt = Date.now();
    const stored: PendingExternalOutboundRequest = {
      ...request,
      createdAt,
      expiresAt: createdAt + this.ttlMs,
    };
    this.requests.set(stored.requestId, stored);
    return stored;
  }

  get(requestId: string): PendingExternalOutboundRequest | undefined {
    this.cleanupExpired();
    return this.requests.get(requestId);
  }

  listPending(limit = 20): PendingExternalOutboundRequest[] {
    this.cleanupExpired();
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(100, Math.floor(limit))) : 20;
    return Array.from(this.requests.values())
      .sort((left, right) => right.createdAt - left.createdAt)
      .slice(0, safeLimit);
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
