import type { CommunityAgentConfig } from "@belldandy/channels";

export type CommunityOrganizeAction =
  | "sort_name"
  | "sort_room"
  | "sort_office"
  | "edit_room_multiple"
  | "edit_office_multiple"
  | "remove_multiple";

export function updateCommunityAgentsRoom(
  agents: CommunityAgentConfig[],
  names: string[],
  input: {
    roomName?: string;
    roomPassword?: string;
  },
): CommunityAgentConfig[] {
  const targets = new Set(names.map((item) => item.trim()).filter(Boolean));
  const roomName = input.roomName?.trim() ?? "";
  const roomPassword = input.roomPassword?.trim() ?? "";
  return agents.map((agent) => {
    if (!targets.has(agent.name)) {
      return agent;
    }
    return {
      ...agent,
      room: roomName
        ? {
          name: roomName,
          ...(roomPassword ? { password: roomPassword } : {}),
        }
        : undefined,
    };
  });
}

export function updateCommunityAgentsOffice(
  agents: CommunityAgentConfig[],
  names: string[],
  input: {
    downloadDir?: string;
    uploadRoots?: string[];
  },
): CommunityAgentConfig[] {
  const targets = new Set(names.map((item) => item.trim()).filter(Boolean));
  const downloadDir = input.downloadDir?.trim() ?? "";
  const uploadRoots = (input.uploadRoots ?? []).map((item) => item.trim()).filter(Boolean);
  return agents.map((agent) => {
    if (!targets.has(agent.name)) {
      return agent;
    }
    return {
      ...agent,
      office: downloadDir || uploadRoots.length > 0
        ? {
          ...(downloadDir ? { downloadDir } : {}),
          ...(uploadRoots.length > 0 ? { uploadRoots } : {}),
        }
        : undefined,
    };
  });
}

export function sortCommunityAgents(
  agents: CommunityAgentConfig[],
  mode: Exclude<CommunityOrganizeAction, "remove_multiple">,
): CommunityAgentConfig[] {
  const nextAgents = [...agents];
  nextAgents.sort((left, right) => {
    if (mode === "sort_room") {
      return compareNormalizedStrings(left.room?.name || left.name, right.room?.name || right.name)
        || compareNormalizedStrings(left.name, right.name);
    }
    if (mode === "sort_office") {
      return compareOfficePresence(left, right)
        || compareNormalizedStrings(left.name, right.name);
    }
    return compareNormalizedStrings(left.name, right.name);
  });
  return nextAgents;
}

export function removeCommunityAgents(
  agents: CommunityAgentConfig[],
  names: string[],
): CommunityAgentConfig[] {
  const targets = new Set(names.map((item) => item.trim()).filter(Boolean));
  return agents.filter((agent) => !targets.has(agent.name));
}

function compareNormalizedStrings(left: string | undefined, right: string | undefined): number {
  return String(left ?? "").trim().toLowerCase().localeCompare(String(right ?? "").trim().toLowerCase());
}

function compareOfficePresence(left: CommunityAgentConfig, right: CommunityAgentConfig): number {
  const leftScore = buildOfficeScore(left);
  const rightScore = buildOfficeScore(right);
  return rightScore - leftScore;
}

function buildOfficeScore(agent: CommunityAgentConfig): number {
  let score = 0;
  if (agent.office?.downloadDir?.trim()) score += 2;
  if ((agent.office?.uploadRoots?.length ?? 0) > 0) score += 1;
  return score;
}
