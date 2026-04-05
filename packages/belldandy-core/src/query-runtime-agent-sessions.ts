import {
  buildDefaultProfile,
  isResidentAgentProfile,
  resolveAgentProfileMetadata,
  type AgentRegistry,
  type ConversationStore,
} from "@belldandy/agent";
import type { ResidentAgentRuntimeRegistry } from "./resident-agent-runtime.js";

function normalizeAgentId(agentId?: string): string {
  return typeof agentId === "string" && agentId.trim() ? agentId.trim() : "default";
}

export function ensureResidentAgentSession(input: {
  agentId?: string;
  agentRegistry?: AgentRegistry;
  residentAgentRuntime: ResidentAgentRuntimeRegistry;
  conversationStore: ConversationStore;
}): {
  agentId: string;
  kind: "resident" | "worker";
  workspaceBinding: "current" | "custom";
  sessionNamespace: string;
  memoryMode: "shared" | "isolated" | "hybrid";
  conversationId: string;
  mainConversationId: string;
  lastConversationId: string;
  status: string;
  lastActiveAt?: number;
  exists: boolean;
} {
  const agentId = normalizeAgentId(input.agentId);
  const profile = input.agentRegistry?.getProfile(agentId)
    ?? (agentId === "default" ? buildDefaultProfile() : undefined);
  if (agentId !== "default" && input.agentRegistry && !profile) {
    throw new Error(`Agent "${agentId}" not found.`);
  }
  if (profile && !isResidentAgentProfile(profile)) {
    throw new Error(`Agent "${agentId}" is not a resident profile.`);
  }

  const runtime = input.residentAgentRuntime.ensureMainConversation(agentId);
  const conversationId = runtime.mainConversationId;
  const exists = Boolean(input.conversationStore.get(conversationId));
  const metadata = resolveAgentProfileMetadata(profile ?? buildDefaultProfile());
  return {
    agentId,
    kind: metadata.kind,
    workspaceBinding: metadata.workspaceBinding,
    sessionNamespace: metadata.sessionNamespace,
    memoryMode: metadata.memoryMode,
    conversationId,
    mainConversationId: runtime.mainConversationId,
    lastConversationId: runtime.lastConversationId,
    status: runtime.status,
    lastActiveAt: runtime.lastActiveAt,
    exists,
  };
}
