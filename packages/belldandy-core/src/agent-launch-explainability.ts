import {
  resolveAgentProfileCatalogMetadata,
  type AgentProfileCatalogMetadata,
  type AgentRegistry,
} from "@belldandy/agent";

type LaunchRole = "default" | "coder" | "researcher" | "verifier";
type LaunchRiskLevel = "low" | "medium" | "high" | "critical";
type HandoffStyle = "summary" | "structured";

type CatalogDefaultLike = {
  role?: LaunchRole;
  permissionMode?: string;
  allowedToolFamilies?: string[];
  maxToolRiskLevel?: LaunchRiskLevel;
  handoffStyle?: HandoffStyle;
  whenToUse?: string[];
  skills?: string[];
};

type DelegationReasonLike = {
  source?: string;
  intentKind?: string;
  intentSummary?: string;
  expectedDeliverableSummary?: string;
  aggregationMode?: string;
  contextKeys?: string[];
  sourceAgentIds?: string[];
};

type LaunchSpecLike = {
  agentId?: string;
  profileId?: string;
  role?: LaunchRole;
  permissionMode?: string;
  allowedToolFamilies?: string[];
  maxToolRiskLevel?: LaunchRiskLevel;
  policySummary?: string;
  delegation?: DelegationReasonLike;
};

export type AgentLaunchExplainability = {
  catalogDefault: {
    role: LaunchRole | null;
    permissionMode: string | null;
    allowedToolFamilies: string[];
    maxToolRiskLevel: LaunchRiskLevel | null;
    handoffStyle: HandoffStyle | null;
    whenToUse: string[];
    skills: string[];
  } | null;
  suggestedLaunch?: {
    source: string | null;
    agentId: string | null;
    profileId: string | null;
    role: LaunchRole | null;
    permissionMode: string | null;
    allowedToolFamilies: string[];
    maxToolRiskLevel: LaunchRiskLevel | null;
    policySummary: string | null;
    handoffStyle: HandoffStyle | null;
  } | null;
  effectiveLaunch: {
    source: "catalog_default" | "runtime_launch_spec";
    agentId: string | null;
    profileId: string | null;
    role: LaunchRole | null;
    permissionMode: string | null;
    allowedToolFamilies: string[];
    maxToolRiskLevel: LaunchRiskLevel | null;
    policySummary: string | null;
    handoffStyle: HandoffStyle | null;
  } | null;
  delegationReason: {
    source: string | null;
    intentKind: string | null;
    intentSummary: string | null;
    expectedDeliverableSummary: string | null;
    aggregationMode: string | null;
    contextKeys: string[];
    sourceAgentIds: string[];
  } | null;
};

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(
    value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean),
  )];
}

function resolveCatalogMetadata(
  agentRegistry: Pick<AgentRegistry, "getProfile"> | undefined,
  agentId: string | undefined,
  profileId: string | undefined,
): AgentProfileCatalogMetadata | undefined {
  const targetProfileId = normalizeOptionalString(profileId) ?? normalizeOptionalString(agentId) ?? "default";
  const profile = agentRegistry?.getProfile(targetProfileId);
  return profile ? resolveAgentProfileCatalogMetadata(profile) : undefined;
}

function buildCatalogDefaultView(source: AgentProfileCatalogMetadata | CatalogDefaultLike | undefined) {
  if (!source) return null;
  const role = ("role" in source ? source.role : undefined) ?? ("defaultRole" in source ? source.defaultRole ?? null : null);
  const permissionMode = normalizeOptionalString(
    "defaultPermissionMode" in source
      ? source.defaultPermissionMode
      : "permissionMode" in source
        ? source.permissionMode
        : undefined,
  );
  const allowedToolFamilies = normalizeStringArray(
    "defaultAllowedToolFamilies" in source
      ? source.defaultAllowedToolFamilies
      : "allowedToolFamilies" in source
        ? source.allowedToolFamilies
        : undefined,
  );
  const maxToolRiskLevel = (
    ("defaultMaxToolRiskLevel" in source
      ? source.defaultMaxToolRiskLevel
      : "maxToolRiskLevel" in source
        ? source.maxToolRiskLevel
        : undefined) ?? null
  ) as LaunchRiskLevel | null;
  const handoffStyle = normalizeOptionalString(source.handoffStyle) as HandoffStyle | null;
  const whenToUse = normalizeStringArray(source.whenToUse);
  const skills = normalizeStringArray(source.skills);

  if (!role && !permissionMode && !allowedToolFamilies.length && !maxToolRiskLevel && !handoffStyle && !whenToUse.length && !skills.length) {
    return null;
  }

  return {
    role: role ?? null,
    permissionMode,
    allowedToolFamilies,
    maxToolRiskLevel,
    handoffStyle,
    whenToUse,
    skills,
  };
}

function buildDelegationReasonView(source: DelegationReasonLike | undefined) {
  if (!source) return null;
  const view = {
    source: normalizeOptionalString(source.source),
    intentKind: normalizeOptionalString(source.intentKind),
    intentSummary: normalizeOptionalString(source.intentSummary),
    expectedDeliverableSummary: normalizeOptionalString(source.expectedDeliverableSummary),
    aggregationMode: normalizeOptionalString(source.aggregationMode),
    contextKeys: normalizeStringArray(source.contextKeys),
    sourceAgentIds: normalizeStringArray(source.sourceAgentIds),
  };
  if (
    !view.source
    && !view.intentKind
    && !view.intentSummary
    && !view.expectedDeliverableSummary
    && !view.aggregationMode
    && !view.contextKeys.length
    && !view.sourceAgentIds.length
  ) {
    return null;
  }
  return view;
}

export function buildAgentLaunchExplainability(input: {
  agentRegistry?: Pick<AgentRegistry, "getProfile">;
  agentId?: string;
  profileId?: string;
  catalog?: AgentProfileCatalogMetadata;
  catalogDefaultOverride?: CatalogDefaultLike;
  launchSpec?: LaunchSpecLike;
  delegationReason?: DelegationReasonLike;
}): AgentLaunchExplainability | undefined {
  const catalog = input.catalog
    ?? resolveCatalogMetadata(
      input.agentRegistry,
      input.launchSpec?.agentId ?? input.agentId,
      input.launchSpec?.profileId ?? input.profileId,
    );
  const catalogDefault = buildCatalogDefaultView(
    input.catalogDefaultOverride
      ? {
        role: input.catalogDefaultOverride.role ?? catalog?.defaultRole,
        permissionMode: input.catalogDefaultOverride.permissionMode ?? catalog?.defaultPermissionMode,
        allowedToolFamilies: input.catalogDefaultOverride.allowedToolFamilies ?? catalog?.defaultAllowedToolFamilies,
        maxToolRiskLevel: input.catalogDefaultOverride.maxToolRiskLevel ?? catalog?.defaultMaxToolRiskLevel,
        handoffStyle: input.catalogDefaultOverride.handoffStyle ?? catalog?.handoffStyle,
        whenToUse: input.catalogDefaultOverride.whenToUse ?? catalog?.whenToUse,
        skills: input.catalogDefaultOverride.skills ?? catalog?.skills,
      }
      : catalog,
  );
  const effectiveLaunch = (() => {
    const agentId = normalizeOptionalString(input.launchSpec?.agentId) ?? normalizeOptionalString(input.agentId);
    const profileId = normalizeOptionalString(input.launchSpec?.profileId) ?? normalizeOptionalString(input.profileId);
    const role = input.launchSpec?.role ?? catalogDefault?.role ?? null;
    const permissionMode = normalizeOptionalString(input.launchSpec?.permissionMode) ?? catalogDefault?.permissionMode ?? null;
    const allowedToolFamilies = normalizeStringArray(input.launchSpec?.allowedToolFamilies);
    const maxToolRiskLevel = input.launchSpec?.maxToolRiskLevel ?? catalogDefault?.maxToolRiskLevel ?? null;
    const policySummary = normalizeOptionalString(input.launchSpec?.policySummary);
    const handoffStyle = catalogDefault?.handoffStyle ?? null;
    const resolvedAllowedToolFamilies = allowedToolFamilies.length > 0
      ? allowedToolFamilies
      : catalogDefault?.allowedToolFamilies ?? [];

    if (!agentId && !profileId && !role && !permissionMode && !resolvedAllowedToolFamilies.length && !maxToolRiskLevel && !policySummary && !handoffStyle) {
      return null;
    }

    return {
      source: input.launchSpec ? "runtime_launch_spec" as const : "catalog_default" as const,
      agentId: agentId ?? null,
      profileId: profileId ?? null,
      role,
      permissionMode,
      allowedToolFamilies: resolvedAllowedToolFamilies,
      maxToolRiskLevel,
      policySummary,
      handoffStyle,
    };
  })();
  const delegationReason = buildDelegationReasonView(input.delegationReason ?? input.launchSpec?.delegation);

  if (!catalogDefault && !effectiveLaunch && !delegationReason) {
    return undefined;
  }

  return {
    catalogDefault,
    effectiveLaunch,
    delegationReason,
  };
}
