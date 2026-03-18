export type TaskSource = "chat" | "sub_agent" | "cron" | "heartbeat" | "manual";
export type TaskStatus = "running" | "success" | "failed" | "partial";
export type TaskMemoryRelation = "used" | "generated" | "referenced";

export interface TaskToolCallSummary {
  toolName: string;
  success: boolean;
  durationMs?: number;
  note?: string;
  actionKey?: string;
  artifactPaths?: string[];
}

export interface TaskRecord {
  id: string;
  conversationId: string;
  sessionKey: string;
  parentConversationId?: string;
  parentTaskId?: string;
  agentId?: string;
  source: TaskSource;
  title?: string;
  objective?: string;
  status: TaskStatus;
  outcome?: string;
  summary?: string;
  reflection?: string;
  toolCalls?: TaskToolCallSummary[];
  artifactPaths?: string[];
  tokenInput?: number;
  tokenOutput?: number;
  tokenTotal?: number;
  durationMs?: number;
  startedAt: string;
  finishedAt?: string;
  summaryModel?: string;
  summaryVersion?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface TaskSearchFilter {
  agentId?: string;
  status?: TaskStatus | TaskStatus[];
  source?: TaskSource | TaskSource[];
  dateFrom?: string;
  dateTo?: string;
  parentConversationId?: string;
}

export interface TaskSearchOptions {
  limit?: number;
  filter?: TaskSearchFilter;
}

export interface TaskConversationStore {
  getHistory(id: string): Array<{ role: "user" | "assistant"; content: string }>;
}
