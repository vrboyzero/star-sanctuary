import fs from "node:fs/promises";
import path from "node:path";

const IDENTITY_FILENAME = "IDENTITY.md";

export type IdentityAuthorityProfile = {
  currentLabel?: string;
  superiorLabels: string[];
  subordinateLabels: string[];
  ownerUuids: string[];
  authorityMode: "verifiable_only" | "disabled";
  responsePolicy: {
    ownerOrSuperior: "execute";
    subordinate: "guide";
    other: "refuse_or_inform";
  };
  source: "identity_md";
};

export type IdentityAuthorityActorRelation =
  | "owner"
  | "superior"
  | "peer"
  | "subordinate"
  | "other"
  | "unknown";

export type IdentityAuthorityAction =
  | "execute"
  | "guide_only"
  | "refuse_or_inform"
  | "escalate"
  | "inactive";

export type RuntimeIdentityAuthorityEvaluation = {
  authorityMode: IdentityAuthorityProfile["authorityMode"];
  authorityActive: boolean;
  verifiableEnvironment: boolean;
  currentLabel?: string;
  actorRelation: IdentityAuthorityActorRelation;
  recommendedAction: IdentityAuthorityAction;
  ownerUuidVerified: boolean;
  senderIdentityVerified: boolean;
  matchedOwnerUuid?: string;
  matchedSuperiorLabel?: string;
  matchedSubordinateLabel?: string;
  reason: string;
};

export type IdentityAuthorityRelationToManager =
  | "self"
  | "superior"
  | "peer"
  | "subordinate"
  | "unknown";

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function normalizeLabelList(value: string | undefined): string[] {
  if (!value) return [];
  return [...new Set(value
    .split(/[,，、]/)
    .map((item) => item.trim())
    .filter(Boolean))];
}

function extractIdentityField(content: string, fieldLabel: string): string | undefined {
  const escaped = fieldLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = content.match(new RegExp(`\\*\\*${escaped}\\*\\*[：:]\\s*(.+?)(?:\\r?\\n|$)`));
  return match?.[1]?.trim() || undefined;
}

export function parseIdentityAuthorityProfile(content: string): IdentityAuthorityProfile | undefined {
  const currentLabel = extractIdentityField(content, "当前身份标签");
  const superiorLabels = normalizeLabelList(extractIdentityField(content, "上级身份标签"));
  const subordinateLabels = normalizeLabelList(extractIdentityField(content, "下级身份标签"));
  const ownerUuids = normalizeLabelList(extractIdentityField(content, "主人UUID"));

  if (!currentLabel && superiorLabels.length === 0 && subordinateLabels.length === 0 && ownerUuids.length === 0) {
    return undefined;
  }

  return {
    ...(currentLabel ? { currentLabel } : {}),
    superiorLabels,
    subordinateLabels,
    ownerUuids,
    authorityMode: currentLabel || superiorLabels.length > 0 || subordinateLabels.length > 0 || ownerUuids.length > 0
      ? "verifiable_only"
      : "disabled",
    responsePolicy: {
      ownerOrSuperior: "execute",
      subordinate: "guide",
      other: "refuse_or_inform",
    },
    source: "identity_md",
  };
}

export async function loadIdentityAuthorityProfile(dir: string): Promise<IdentityAuthorityProfile | undefined> {
  try {
    const identityPath = path.join(dir, IDENTITY_FILENAME);
    const identityContent = await fs.readFile(identityPath, "utf-8");
    return parseIdentityAuthorityProfile(identityContent);
  } catch {
    return undefined;
  }
}

export async function extractOwnerUuid(dir: string): Promise<string | undefined> {
  const profile = await loadIdentityAuthorityProfile(dir);
  return profile?.ownerUuids[0];
}

export function evaluateRuntimeIdentityAuthority(
  profile: IdentityAuthorityProfile | undefined,
  input: {
    userUuid?: string;
    senderId?: string;
    senderIdentity?: string;
    senderType?: "user" | "agent";
  },
): RuntimeIdentityAuthorityEvaluation | undefined {
  if (!profile) {
    return undefined;
  }

  const userUuid = normalizeOptionalString(input.userUuid);
  const senderId = normalizeOptionalString(input.senderId);
  const senderIdentity = normalizeOptionalString(input.senderIdentity);
  const senderType = input.senderType;
  const currentLabel = normalizeOptionalString(profile.currentLabel);
  const verifiableEnvironment = Boolean(userUuid || senderId || senderIdentity);

  if (!verifiableEnvironment || profile.authorityMode !== "verifiable_only") {
    return {
      authorityMode: profile.authorityMode,
      authorityActive: false,
      verifiableEnvironment,
      ...(currentLabel ? { currentLabel } : {}),
      actorRelation: "unknown",
      recommendedAction: "inactive",
      ownerUuidVerified: false,
      senderIdentityVerified: false,
      reason: !verifiableEnvironment
        ? "No verifiable UUID or sender identity is available in this runtime."
        : "Authority mode is disabled.",
    };
  }

  const matchedOwnerUuid = [userUuid, senderId]
    .filter(Boolean)
    .find((value) => profile.ownerUuids.includes(value!));
  const matchedSuperiorLabel = senderIdentity && senderType === "agent"
    ? profile.superiorLabels.find((label) => label === senderIdentity)
    : undefined;
  const matchedSubordinateLabel = senderIdentity && senderType === "agent"
    ? profile.subordinateLabels.find((label) => label === senderIdentity)
    : undefined;

  let actorRelation: IdentityAuthorityActorRelation = "unknown";
  let recommendedAction: IdentityAuthorityAction = "inactive";
  let reason = "No verifiable authority rule matched.";

  if (matchedOwnerUuid) {
    actorRelation = "owner";
    recommendedAction = "execute";
    reason = `Matched owner UUID: ${matchedOwnerUuid}.`;
  } else if (matchedSuperiorLabel) {
    actorRelation = "superior";
    recommendedAction = "execute";
    reason = `Matched superior identity label: ${matchedSuperiorLabel}.`;
  } else if (matchedSubordinateLabel) {
    actorRelation = "subordinate";
    recommendedAction = "guide_only";
    reason = `Matched subordinate identity label: ${matchedSubordinateLabel}.`;
  } else if (senderIdentity && currentLabel && senderIdentity === currentLabel && senderType === "agent") {
    actorRelation = "peer";
    recommendedAction = "escalate";
    reason = `Sender shares the same identity label: ${currentLabel}.`;
  } else if (senderId || userUuid || senderIdentity) {
    actorRelation = "other";
    recommendedAction = "refuse_or_inform";
    reason = "Sender is verifiable but not listed as owner, superior, or subordinate.";
  }

  return {
    authorityMode: profile.authorityMode,
    authorityActive: actorRelation !== "unknown",
    verifiableEnvironment: true,
    ...(currentLabel ? { currentLabel } : {}),
    actorRelation,
    recommendedAction,
    ownerUuidVerified: Boolean(matchedOwnerUuid),
    senderIdentityVerified: Boolean(senderIdentity),
    ...(matchedOwnerUuid ? { matchedOwnerUuid } : {}),
    ...(matchedSuperiorLabel ? { matchedSuperiorLabel } : {}),
    ...(matchedSubordinateLabel ? { matchedSubordinateLabel } : {}),
    reason,
  };
}

export function deriveAuthorityRelationToManager(input: {
  managerAgentId?: string;
  managerProfile?: IdentityAuthorityProfile;
  memberAgentId?: string;
  memberProfile?: IdentityAuthorityProfile;
}): IdentityAuthorityRelationToManager {
  const managerAgentId = normalizeOptionalString(input.managerAgentId);
  const memberAgentId = normalizeOptionalString(input.memberAgentId);
  if (managerAgentId && memberAgentId && managerAgentId === memberAgentId) {
    return "self";
  }

  const managerLabel = normalizeOptionalString(input.managerProfile?.currentLabel);
  const memberLabel = normalizeOptionalString(input.memberProfile?.currentLabel);
  if (!managerLabel || !memberLabel) {
    return "unknown";
  }
  if (managerLabel === memberLabel) {
    return "peer";
  }

  if (input.managerProfile?.subordinateLabels.includes(memberLabel)) {
    return "subordinate";
  }
  if (input.managerProfile?.superiorLabels.includes(memberLabel)) {
    return "superior";
  }
  if (input.memberProfile?.superiorLabels.includes(managerLabel)) {
    return "subordinate";
  }
  if (input.memberProfile?.subordinateLabels.includes(managerLabel)) {
    return "superior";
  }

  return "peer";
}

export function buildIdentityAuthorityReportsTo(
  profile: IdentityAuthorityProfile | undefined,
  managerProfile?: IdentityAuthorityProfile,
): string[] | undefined {
  const reportsTo = new Set<string>(profile?.superiorLabels ?? []);
  const managerLabel = normalizeOptionalString(managerProfile?.currentLabel);
  if (managerLabel && profile?.superiorLabels.includes(managerLabel)) {
    reportsTo.add(managerLabel);
  }
  return reportsTo.size > 0 ? [...reportsTo] : undefined;
}

export function buildIdentityAuthorityMayDirect(
  profile: IdentityAuthorityProfile | undefined,
): string[] | undefined {
  const mayDirect = new Set<string>(profile?.subordinateLabels ?? []);
  return mayDirect.size > 0 ? [...mayDirect] : undefined;
}
