export type PendingToolControlRequest = {
  requestId: string;
  conversationId: string;
  requestedByAgentId?: string;
  changes: {
    enableBuiltin: string[];
    disableBuiltin: string[];
    enableMcpServers: string[];
    disableMcpServers: string[];
    enablePlugins: string[];
    disablePlugins: string[];
  };
  createdAt: number;
  expiresAt: number;
  passwordApprovedAt?: number;
};

const DEFAULT_TTL_MS = 10 * 60 * 1000;

export class ToolControlConfirmationStore {
  private readonly requests = new Map<string, PendingToolControlRequest>();
  private readonly ttlMs: number;

  constructor(ttlMs = DEFAULT_TTL_MS) {
    this.ttlMs = ttlMs;
  }

  create(
    req: Omit<PendingToolControlRequest, "createdAt" | "expiresAt">,
  ): PendingToolControlRequest {
    this.cleanupExpired();
    const createdAt = Date.now();
    const stored: PendingToolControlRequest = {
      ...req,
      createdAt,
      expiresAt: createdAt + this.ttlMs,
    };
    this.requests.set(stored.requestId, stored);
    return stored;
  }

  get(requestId: string): PendingToolControlRequest | undefined {
    this.cleanupExpired();
    return this.requests.get(requestId);
  }

  delete(requestId: string): void {
    this.requests.delete(requestId);
  }

  getLatestByConversation(conversationId: string): PendingToolControlRequest | undefined {
    this.cleanupExpired();
    let latest: PendingToolControlRequest | undefined;
    for (const req of this.requests.values()) {
      if (req.conversationId !== conversationId) continue;
      if (!latest || req.createdAt > latest.createdAt) {
        latest = req;
      }
    }
    return latest;
  }

  getLatestApprovedByConversation(conversationId: string): PendingToolControlRequest | undefined {
    this.cleanupExpired();
    let latest: PendingToolControlRequest | undefined;
    for (const req of this.requests.values()) {
      if (req.conversationId !== conversationId || !req.passwordApprovedAt) continue;
      if (!latest || req.passwordApprovedAt > (latest.passwordApprovedAt ?? 0)) {
        latest = req;
      }
    }
    return latest;
  }

  markPasswordApproved(requestId: string, approvedAt = Date.now()): PendingToolControlRequest | undefined {
    this.cleanupExpired();
    const existing = this.requests.get(requestId);
    if (!existing) return undefined;
    const updated: PendingToolControlRequest = {
      ...existing,
      passwordApprovedAt: approvedAt,
    };
    this.requests.set(requestId, updated);
    return updated;
  }

  cleanupExpired(now = Date.now()): void {
    for (const [requestId, req] of this.requests.entries()) {
      if (req.expiresAt <= now) {
        this.requests.delete(requestId);
      }
    }
  }
}
