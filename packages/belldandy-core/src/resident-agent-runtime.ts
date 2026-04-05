export type ResidentAgentRuntimeStatus = "idle" | "running" | "background" | "error";

export type ResidentAgentRuntimeRecord = {
  agentId: string;
  mainConversationId: string;
  lastConversationId: string;
  status: ResidentAgentRuntimeStatus;
  lastActiveAt?: number;
};

function normalizeAgentId(agentId?: string): string {
  return typeof agentId === "string" && agentId.trim() ? agentId.trim() : "default";
}

function toSafeConversationToken(value: string): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "default";
}

export function buildResidentMainConversationId(agentId?: string): string {
  const normalized = normalizeAgentId(agentId);
  return `agent:${toSafeConversationToken(normalized)}:main`;
}

export class ResidentAgentRuntimeRegistry {
  private readonly records = new Map<string, ResidentAgentRuntimeRecord>();

  constructor(agentIds: string[] = []) {
    for (const agentId of agentIds) {
      this.ensureAgent(agentId);
    }
  }

  ensureAgent(agentId?: string): ResidentAgentRuntimeRecord {
    const normalizedAgentId = normalizeAgentId(agentId);
    const existing = this.records.get(normalizedAgentId);
    if (existing) {
      return existing;
    }

    const record: ResidentAgentRuntimeRecord = {
      agentId: normalizedAgentId,
      mainConversationId: buildResidentMainConversationId(normalizedAgentId),
      lastConversationId: buildResidentMainConversationId(normalizedAgentId),
      status: "idle",
    };
    this.records.set(normalizedAgentId, record);
    return record;
  }

  ensureMainConversation(agentId?: string): ResidentAgentRuntimeRecord {
    const record = this.ensureAgent(agentId);
    if (!record.mainConversationId) {
      record.mainConversationId = buildResidentMainConversationId(record.agentId);
    }
    if (!record.lastConversationId) {
      record.lastConversationId = record.mainConversationId;
    }
    this.records.set(record.agentId, record);
    return record;
  }

  touchConversation(agentId: string | undefined, conversationId: string, options: { main?: boolean } = {}): ResidentAgentRuntimeRecord {
    const record = this.ensureAgent(agentId);
    const normalizedConversationId = typeof conversationId === "string" && conversationId.trim()
      ? conversationId.trim()
      : record.mainConversationId;
    record.lastConversationId = normalizedConversationId;
    if (options.main || !record.mainConversationId) {
      record.mainConversationId = normalizedConversationId;
    }
    record.lastActiveAt = Date.now();
    this.records.set(record.agentId, record);
    return record;
  }

  markStatus(agentId: string | undefined, status: ResidentAgentRuntimeStatus): ResidentAgentRuntimeRecord {
    const record = this.ensureAgent(agentId);
    record.status = status;
    record.lastActiveAt = Date.now();
    this.records.set(record.agentId, record);
    return record;
  }

  get(agentId?: string): ResidentAgentRuntimeRecord {
    return this.ensureAgent(agentId);
  }

  list(agentIds: string[] = []): ResidentAgentRuntimeRecord[] {
    if (!agentIds.length) {
      return [...this.records.values()].map((item) => ({ ...item }));
    }
    return agentIds.map((agentId) => ({ ...this.ensureAgent(agentId) }));
  }
}
