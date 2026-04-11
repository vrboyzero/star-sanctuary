import type { ConversationAccessKind } from "@belldandy/skills";

export function readEnv(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : undefined;
}

export function parseConversationAllowedKinds(raw: string | undefined): ConversationAccessKind[] {
  const allKinds: ConversationAccessKind[] = ["main", "subtask", "goal", "heartbeat"];
  if (typeof raw === "undefined") {
    return allKinds;
  }

  const normalized = raw.trim().toLowerCase();
  if (!normalized || normalized === "none") {
    return [];
  }
  if (normalized === "all") {
    return allKinds;
  }

  const allowed = normalized
    .split(",")
    .map((item) => item.trim())
    .filter((item): item is ConversationAccessKind =>
      item === "main" || item === "subtask" || item === "goal" || item === "heartbeat");
  return [...new Set(allowed)];
}
