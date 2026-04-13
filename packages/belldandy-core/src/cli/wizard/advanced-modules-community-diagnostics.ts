import type { CommunityAgentConfig } from "@belldandy/channels";

export function buildCommunityReconnectOfficeDiagnostics(input: {
  reconnect?: {
    enabled?: boolean;
    maxRetries?: number;
    backoffMs?: number;
  };
  agents: CommunityAgentConfig[];
}): string[] {
  const lines: string[] = [];
  const agents = input.agents;
  const reconnectEnabled = input.reconnect?.enabled ?? true;
  const maxRetries = input.reconnect?.maxRetries ?? 10;
  const backoffMs = input.reconnect?.backoffMs ?? 5000;

  if (agents.length === 0) {
    lines.push("No community agents are configured yet.");
  }
  if (agents.length > 0 && reconnectEnabled === false) {
    lines.push("Reconnect is disabled while community agents exist; dropped connections will not auto-recover.");
  }
  if (agents.length > 0 && reconnectEnabled && maxRetries === 0) {
    lines.push("Reconnect max retries is 0, so each disconnect will stop immediately after the first failure.");
  }
  if (agents.length > 0 && reconnectEnabled && backoffMs > 0 && backoffMs < 1000) {
    lines.push(`Reconnect backoff is ${backoffMs}ms; repeated failures may churn logs and reconnect attempts.`);
  }
  if (agents.length > 0 && reconnectEnabled && backoffMs >= 60000) {
    lines.push(`Reconnect backoff is ${backoffMs}ms; recovery after a disconnect may feel delayed.`);
  }

  const agentsWithoutRoom = agents.filter((agent) => !agent.room?.name?.trim());
  if (agentsWithoutRoom.length > 0) {
    lines.push(`${agentsWithoutRoom.length} agent(s) have no room configured: ${summarizeAgentNames(agentsWithoutRoom)}.`);
  }

  const agentsWithoutOffice = agents.filter((agent) => !agent.office?.downloadDir?.trim() && (agent.office?.uploadRoots?.length ?? 0) === 0);
  if (agentsWithoutOffice.length > 0) {
    lines.push(`${agentsWithoutOffice.length} agent(s) have no office paths configured: ${summarizeAgentNames(agentsWithoutOffice)}.`);
  }

  const downloadOnlyAgents = agents.filter((agent) => agent.office?.downloadDir?.trim() && (agent.office?.uploadRoots?.length ?? 0) === 0);
  if (downloadOnlyAgents.length > 0) {
    lines.push(`${downloadOnlyAgents.length} agent(s) have office downloadDir but no uploadRoots: ${summarizeAgentNames(downloadOnlyAgents)}.`);
  }

  const uploadOnlyAgents = agents.filter((agent) => !agent.office?.downloadDir?.trim() && (agent.office?.uploadRoots?.length ?? 0) > 0);
  if (uploadOnlyAgents.length > 0) {
    lines.push(`${uploadOnlyAgents.length} agent(s) have office uploadRoots but no downloadDir: ${summarizeAgentNames(uploadOnlyAgents)}.`);
  }

  const sharedRooms = collectDuplicateLabels(agents.map((agent) => agent.room?.name?.trim()).filter(Boolean) as string[]);
  if (sharedRooms.length > 0) {
    lines.push(`Multiple agents target the same room: ${sharedRooms.join(", ")}.`);
  }

  return lines;
}

function summarizeAgentNames(agents: CommunityAgentConfig[], limit = 3): string {
  const names = agents.map((agent) => agent.name);
  if (names.length <= limit) {
    return names.join(", ");
  }
  return `${names.slice(0, limit).join(", ")} +${names.length - limit} more`;
}

function collectDuplicateLabels(values: string[]): string[] {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([value]) => value)
    .sort((left, right) => left.localeCompare(right));
}
