import {
  loadChannelSecurityConfig,
  resolveChannelSecurityPolicy,
  resolveChannelSecurityConfigPath,
  type ChannelSecurityConfig,
  type ChannelSecurityPolicy,
  type SecurityBackedChannelKind,
  type SecurityMentionChatKind,
} from "@belldandy/channels";

export interface ChannelSecurityDoctorChannelState {
  enabled: boolean;
  accountIds?: string[];
}

export interface ChannelSecurityDoctorItem {
  channel: SecurityBackedChannelKind;
  status: "pass" | "warn";
  message: string;
  warnings: string[];
  policy?: ChannelSecurityPolicy;
}

export interface ChannelSecurityDoctorReport {
  configPath: string;
  config: ChannelSecurityConfig;
  items: ChannelSecurityDoctorItem[];
  summary: {
    enabledChannelCount: number;
    configuredChannelCount: number;
    warningCount: number;
  };
}

const CHANNEL_LABELS: Record<SecurityBackedChannelKind, string> = {
  discord: "Discord",
  feishu: "Feishu",
  qq: "QQ",
  community: "Community",
};

const CHANNEL_PRIMARY_MENTION_KIND: Record<SecurityBackedChannelKind, SecurityMentionChatKind> = {
  discord: "channel",
  feishu: "group",
  qq: "group",
  community: "room",
};

function countConfiguredChannels(config: ChannelSecurityConfig): number {
  return Object.values(config.channels).filter(Boolean).length;
}

function buildDoctorWarnings(
  channel: SecurityBackedChannelKind,
  policy: ChannelSecurityPolicy | undefined,
  state: ChannelSecurityDoctorChannelState,
): string[] {
  if (!policy) {
    return [
      `missing policy; add ${channel} defaults to channel-security.json before expanding this channel`,
    ];
  }

  const config: ChannelSecurityConfig = {
    version: 1,
    channels: {
      [channel]: policy,
    },
  };
  const accountIds = Array.isArray(state.accountIds)
    ? state.accountIds.map((item) => item.trim()).filter(Boolean)
    : [];
  const warnings: string[] = [];
  const primaryMentionKind = CHANNEL_PRIMARY_MENTION_KIND[channel];
  const warningTargets = accountIds.length ? accountIds : [""];
  for (const accountId of warningTargets) {
    const effectivePolicy = accountIds.length
      ? resolveChannelSecurityPolicy(config, channel, accountId)
      : resolveChannelSecurityPolicy(config, channel);
    if (!effectivePolicy) {
      warnings.push(accountIds.length
        ? `account ${accountId} has no effective policy`
        : "no effective policy");
      continue;
    }
    const targetPrefix = accountIds.length ? `account ${accountId}: ` : "";
    if ((effectivePolicy.dmPolicy ?? "open") === "allowlist" && (effectivePolicy.allowFrom?.length ?? 0) === 0) {
      warnings.push(`${targetPrefix}dmPolicy=allowlist but allowFrom is empty`);
    }
    if (effectivePolicy.mentionRequired?.[primaryMentionKind] !== true) {
      warnings.push(`${targetPrefix}${primaryMentionKind} mention gate is not enabled`);
    }
  }
  return warnings;
}

function formatDoctorMessage(
  channel: SecurityBackedChannelKind,
  policy: ChannelSecurityPolicy | undefined,
  warnings: string[],
  state: ChannelSecurityDoctorChannelState,
): string {
  if (!policy) {
    return `${CHANNEL_LABELS[channel]} enabled, but no channel-security policy was found`;
  }

  const config: ChannelSecurityConfig = {
    version: 1,
    channels: {
      [channel]: policy,
    },
  };
  const accountIds = Array.isArray(state.accountIds)
    ? state.accountIds.map((item) => item.trim()).filter(Boolean)
    : [];
  const summaryPolicy = accountIds.length
    ? resolveChannelSecurityPolicy(config, channel, accountIds[0])
    : resolveChannelSecurityPolicy(config, channel);
  const mentionKinds = Object.entries(summaryPolicy?.mentionRequired ?? {})
    .filter(([, enabled]) => enabled === true)
    .map(([kind]) => kind)
    .join("/");
  const summary = [
    `dm=${summaryPolicy?.dmPolicy ?? "open"}`,
    `allowFrom=${summaryPolicy?.allowFrom?.length ?? 0}`,
    `mention=${mentionKinds || "off"}`,
    `accounts=${Object.keys(policy.accounts ?? {}).length}`,
  ].join(", ");
  return warnings.length ? `${summary}; ${warnings[0]}` : summary;
}

export function buildChannelSecurityDoctorReport(params: {
  stateDir: string;
  channels: Record<SecurityBackedChannelKind, ChannelSecurityDoctorChannelState>;
}): ChannelSecurityDoctorReport {
  const configPath = resolveChannelSecurityConfigPath(params.stateDir);
  const config = loadChannelSecurityConfig(configPath);
  const items: ChannelSecurityDoctorItem[] = [];

  for (const [channel, state] of Object.entries(params.channels) as Array<
    [SecurityBackedChannelKind, ChannelSecurityDoctorChannelState]
  >) {
    if (!state.enabled) continue;
    const policy = config.channels[channel];
    const warnings = buildDoctorWarnings(channel, policy, state);
    items.push({
      channel,
      status: warnings.length ? "warn" : "pass",
      message: formatDoctorMessage(channel, policy, warnings, state),
      warnings,
      ...(policy ? { policy } : {}),
    });
  }

  const warningCount = items.filter((item) => item.status === "warn").length;
  return {
    configPath,
    config,
    items,
    summary: {
      enabledChannelCount: items.length,
      configuredChannelCount: countConfiguredChannels(config),
      warningCount,
    },
  };
}
