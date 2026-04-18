import {
  buildProviderNativeSystemBlocks,
  renderSystemPromptSections,
  resolveAgentProfileMetadata,
  type AgentProfile,
  type AgentPromptDelta,
  type AgentPromptSnapshot,
  type AgentPromptSnapshotMessage,
  type ProviderNativeSystemBlock,
  type SystemPromptBuildResult,
  type SystemPromptSection,
} from "@belldandy/agent";
import type { IdentityAuthorityProfile } from "@belldandy/protocol";
import type { ToolExecutor } from "@belldandy/skills";

import { persistConversationPromptSnapshot } from "../conversation-prompt-snapshot.js";
import { resolveResidentMemoryPolicy } from "../resident-memory-policy.js";
import { resolveResidentStateBindingView } from "../resident-state-binding.js";
import { PromptSnapshotStore } from "../prompt-snapshot-store.js";
import {
  applyPromptExperimentsToSections,
  buildPromptTokenBreakdown,
  withDeltaPromptMetrics,
  withProviderNativeSystemBlockPromptMetrics,
  withSectionPromptMetrics,
  type PromptExperimentConfig,
  type PromptTextMetrics,
} from "../prompt-observability.js";
import { buildToolBehaviorObservability } from "../tool-behavior-observability.js";
import {
  cloneProviderNativeSystemBlocks,
  createGatewaySystemPromptSection,
  isRecord,
  readResidentPromptMetadata,
  renderProviderNativeSystemBlocksText,
  stripStructuredRuntimeIdentityFromSystemPrompt,
} from "./gateway-prompt-runtime.js";

type GatewayLogger = {
  info: (scope: string, message: string, data?: unknown) => void;
  warn: (scope: string, message: string, data?: unknown) => void;
};

export function createGatewayPromptInspectionRuntime({
  stateDir,
  logger,
  promptSnapshotStore,
  promptSnapshotMaxPersistedRuns,
  promptSnapshotHeartbeatMaxRuns,
  promptSnapshotEmailThreadMaxRuns,
  promptSnapshotRetentionDays,
  agentWorkspaceCache,
  dynamicSystemPromptBuild,
  toolExecutor,
  promptExperimentConfig,
  isTtsEnabled,
}: {
  stateDir: string;
  logger: GatewayLogger;
  promptSnapshotStore: PromptSnapshotStore;
  promptSnapshotMaxPersistedRuns: number;
  promptSnapshotHeartbeatMaxRuns: number;
  promptSnapshotEmailThreadMaxRuns: number;
  promptSnapshotRetentionDays: number;
  agentWorkspaceCache: Map<string, {
    build: SystemPromptBuildResult;
    authorityProfile?: IdentityAuthorityProfile;
  }>;
  dynamicSystemPromptBuild: SystemPromptBuildResult;
  toolExecutor: ToolExecutor;
  promptExperimentConfig?: PromptExperimentConfig;
  isTtsEnabled: () => boolean;
}) {
  function persistPromptSnapshot(snapshot: AgentPromptSnapshot): void {
    promptSnapshotStore.save(snapshot);
    void persistConversationPromptSnapshot({
      stateDir,
      snapshot,
      retention: {
        defaultMaxRunsPerConversation: promptSnapshotMaxPersistedRuns,
        heartbeatMaxRuns: promptSnapshotHeartbeatMaxRuns,
        emailThreadMaxRuns: promptSnapshotEmailThreadMaxRuns,
        maxAgeDays: promptSnapshotRetentionDays,
      },
    }).catch((error) => {
      logger.warn("prompt-snapshot", `Failed to persist prompt snapshot for conversation "${snapshot.conversationId}"`, error);
    });
  }

  function buildPromptInspectionProviderNativeSystemBlocks(input: {
    sections?: SystemPromptSection[];
    deltas?: AgentPromptDelta[];
    snapshot?: AgentPromptSnapshot;
    fallbackText?: string;
  }): Array<ProviderNativeSystemBlock & PromptTextMetrics> {
    const snapshotBlocks = cloneProviderNativeSystemBlocks(input.snapshot?.providerNativeSystemBlocks);
    const resolvedBlocks = snapshotBlocks && snapshotBlocks.length > 0
      ? snapshotBlocks
      : buildProviderNativeSystemBlocks({
        sections: input.sections,
        deltas: input.deltas,
        fallbackText: input.fallbackText,
      });
    return resolvedBlocks.map(withProviderNativeSystemBlockPromptMetrics);
  }

  function buildEffectiveAgentPromptInspection(profile: AgentProfile): {
    scope?: "agent" | "run";
    agentId: string;
    displayName: string;
    model: string;
    conversationId?: string;
    runId?: string;
    createdAt?: number;
    text: string;
    truncated: boolean;
    maxChars?: number;
    totalChars: number;
    finalChars: number;
    sections: Array<SystemPromptSection & PromptTextMetrics>;
    droppedSections: Array<SystemPromptSection & PromptTextMetrics>;
    deltas: Array<AgentPromptDelta & PromptTextMetrics>;
    providerNativeSystemBlocks: Array<ProviderNativeSystemBlock & PromptTextMetrics>;
    messages?: Array<Record<string, unknown>>;
    metadata: Record<string, unknown>;
  } {
    const baseBuild = agentWorkspaceCache.get(profile.id)?.build ?? dynamicSystemPromptBuild;
    const visibleToolContracts = toolExecutor.getContracts(profile.id);
    const registeredToolContractNames = new Set(toolExecutor.getRegisteredToolContracts().map((contract) => contract.name));
    const toolBehaviorContracts = buildToolBehaviorObservability({
      contracts: visibleToolContracts,
      disabledContractNamesConfigured: promptExperimentConfig?.disabledToolContractNames,
      disabledContractNamesApplied: (promptExperimentConfig?.disabledToolContractNames ?? [])
        .filter((name) => registeredToolContractNames.has(name)),
    });
    const sections = [...baseBuild.sections];

    if (isTtsEnabled()) {
      sections.push(createGatewaySystemPromptSection({
        id: "tts-mode",
        label: "tts-mode",
        source: "runtime",
        priority: 130,
        text: `## [SYSTEM MODE: VOICE/TTS ENABLED]
The user has enabled text-to-speech. Audio will be generated automatically by the system.
You do NOT need to call any TTS tool — just respond with text as usual.
Do NOT include any <audio> HTML tags or [Download] links in your response.
Keep responses concise and natural for spoken delivery.`,
      }));
    }

    if (profile.systemPromptOverride) {
      sections.push(createGatewaySystemPromptSection({
        id: "profile-override",
        label: "profile-override",
        source: "profile",
        priority: 140,
        text: profile.systemPromptOverride.trim(),
      }));
    }

    const builtinPromptDiscoverySummary = toolExecutor.buildDeferredToolDiscoveryPromptSummary(profile.id);

    if (toolBehaviorContracts.summary) {
      sections.push(createGatewaySystemPromptSection({
        id: "tool-behavior-contracts",
        label: "tool-behavior-contracts",
        source: "runtime",
        priority: 105,
        text: toolBehaviorContracts.summary,
      }));
    }

    if (builtinPromptDiscoverySummary) {
      sections.push(createGatewaySystemPromptSection({
        id: "builtin-discovery",
        label: "builtin-discovery",
        source: "runtime",
        priority: 107,
        text: builtinPromptDiscoverySummary,
      }));
    }

    const promptExperimentResult = applyPromptExperimentsToSections(sections, promptExperimentConfig);
    const text = renderSystemPromptSections(promptExperimentResult.sections);
    const providerNativeSystemBlocks = buildPromptInspectionProviderNativeSystemBlocks({
      sections: promptExperimentResult.sections,
      fallbackText: text,
    });
    const tokenBreakdown = buildPromptTokenBreakdown({
      systemPromptText: text,
      sections: promptExperimentResult.sections,
      droppedSections: [...baseBuild.droppedSections, ...promptExperimentResult.droppedSections],
      providerNativeSystemBlocks,
    });
    const resolvedProfileMetadata = resolveAgentProfileMetadata(profile);
    const memoryPolicy = resolveResidentMemoryPolicy(stateDir, profile);
    const residentStateBinding = resolveResidentStateBindingView(stateDir, profile);
    return {
      scope: "agent",
      agentId: profile.id,
      displayName: profile.displayName,
      model: profile.model,
      text,
      truncated: baseBuild.truncated,
      maxChars: baseBuild.maxChars,
      totalChars: text.length,
      finalChars: text.length,
      sections: promptExperimentResult.sections.map(withSectionPromptMetrics),
      droppedSections: [...baseBuild.droppedSections, ...promptExperimentResult.droppedSections].map(withSectionPromptMetrics),
      deltas: [],
      providerNativeSystemBlocks,
      metadata: {
        workspaceDir: resolvedProfileMetadata.workspaceDir,
        residentProfile: {
          kind: resolvedProfileMetadata.kind,
          workspaceBinding: resolvedProfileMetadata.workspaceBinding,
          workspaceDir: resolvedProfileMetadata.workspaceDir,
          sessionNamespace: resolvedProfileMetadata.sessionNamespace,
          memoryMode: resolvedProfileMetadata.memoryMode,
        },
        memoryPolicy: {
          memoryMode: memoryPolicy.memoryMode,
          managerStateDir: memoryPolicy.managerStateDir,
          privateStateDir: memoryPolicy.privateStateDir,
          sharedStateDir: memoryPolicy.sharedStateDir,
          includeSharedMemoryReads: memoryPolicy.includeSharedMemoryReads,
          readTargets: [...memoryPolicy.readTargets],
          writeTarget: memoryPolicy.writeTarget,
          summary: memoryPolicy.summary,
        },
        residentStateBinding,
        includesTtsMode: isTtsEnabled(),
        hasProfileOverride: Boolean(profile.systemPromptOverride),
        baseFinalChars: baseBuild.finalChars,
        baseSectionCount: baseBuild.sections.length,
        finalSectionCount: promptExperimentResult.sections.length,
        deltaCount: 0,
        deltaChars: 0,
        includesHookSystemPrompt: false,
        providerNativeSystemBlockCount: providerNativeSystemBlocks.length,
        providerNativeSystemBlockChars: tokenBreakdown.providerNativeSystemBlockEstimatedChars,
        providerNativeSystemBlockTypes: [...new Set(providerNativeSystemBlocks.map((block) => block.blockType))],
        providerNativeCacheEligibleBlockIds: providerNativeSystemBlocks
          .filter((block) => block.cacheControlEligible)
          .map((block) => block.id),
        tokenBreakdown,
        ...(baseBuild.truncationReason ? { truncationReason: { ...baseBuild.truncationReason } } : {}),
        toolBehaviorObservability: {
          counts: toolBehaviorContracts.counts,
          included: toolBehaviorContracts.included,
          ...(toolBehaviorContracts.summary ? { summary: toolBehaviorContracts.summary } : {}),
          ...(toolBehaviorContracts.experiment ? { experiment: toolBehaviorContracts.experiment } : {}),
        },
        promptExperiments: {
          disabledSectionIdsConfigured: promptExperimentConfig?.disabledSectionIds ?? [],
          disabledSectionIdsApplied: promptExperimentResult.disabledSectionIdsApplied,
          sectionPriorityOverridesConfigured: promptExperimentConfig?.sectionPriorityOverrides ?? {},
          sectionPriorityOverridesApplied: promptExperimentResult.sectionPriorityOverridesApplied,
          disabledToolContractNamesConfigured: promptExperimentConfig?.disabledToolContractNames ?? [],
          disabledToolContractNamesApplied: (promptExperimentConfig?.disabledToolContractNames ?? [])
            .filter((name) => registeredToolContractNames.has(name)),
        },
      },
    };
  }

  function normalizePromptSnapshotMessages(messages: AgentPromptSnapshotMessage[]): Array<Record<string, unknown>> {
    return messages.map((message) => ({
      role: message.role,
      content: Array.isArray(message.content)
        ? message.content.map((part) => ({ ...part }))
        : message.content,
      ...(message.toolCallId ? { toolCallId: message.toolCallId } : {}),
    }));
  }

  function buildRunPromptInspection(snapshot: AgentPromptSnapshot, profile?: AgentProfile): {
    scope: "run";
    agentId: string;
    displayName?: string;
    model?: string;
    conversationId: string;
    runId?: string;
    createdAt: number;
    text: string;
    truncated: boolean;
    maxChars?: number;
    totalChars: number;
    finalChars: number;
    sections: Array<SystemPromptSection & PromptTextMetrics>;
    droppedSections: Array<SystemPromptSection & PromptTextMetrics>;
    deltas: Array<AgentPromptDelta & PromptTextMetrics>;
    providerNativeSystemBlocks: Array<ProviderNativeSystemBlock & PromptTextMetrics>;
    messages: Array<Record<string, unknown>>;
    metadata: Record<string, unknown>;
  } {
    const baseInspection = profile ? buildEffectiveAgentPromptInspection(profile) : undefined;
    const snapshotProviderNativeBlocks = cloneProviderNativeSystemBlocks(snapshot.providerNativeSystemBlocks);
    const structuredSplitPrompt = snapshotProviderNativeBlocks.length === 0
      ? stripStructuredRuntimeIdentityFromSystemPrompt({
        systemPrompt: snapshot.systemPrompt,
        deltas: snapshot.deltas,
      })
      : undefined;
    const staticPromptText = snapshotProviderNativeBlocks.length > 0
      ? renderProviderNativeSystemBlocksText(
        snapshotProviderNativeBlocks.filter((block) => block.blockType !== "dynamic-runtime"),
      )
      : (structuredSplitPrompt?.primaryText || snapshot.systemPrompt).trim();
    const sections: SystemPromptSection[] = [];
    const deltaRecords: AgentPromptDelta[] = [];
    let droppedSections: Array<SystemPromptSection & PromptTextMetrics> = [];
    let truncated = false;
    let maxChars: number | undefined;

    if (snapshot.hookSystemPromptUsed) {
      sections.push(createGatewaySystemPromptSection({
        id: "hook-system-prompt",
        label: "hook-system-prompt",
        source: "runtime",
        priority: 145,
        text: staticPromptText || snapshot.systemPrompt,
      }));
    } else if (
      baseInspection
      && snapshotProviderNativeBlocks.length > 0
      && renderProviderNativeSystemBlocksText(
        snapshotProviderNativeBlocks.filter((block) => block.blockType !== "dynamic-runtime"),
      ) === baseInspection.text
    ) {
      sections.push(...baseInspection.sections);
      droppedSections = baseInspection.droppedSections;
      truncated = baseInspection.truncated;
      maxChars = baseInspection.maxChars;
    } else if (baseInspection && structuredSplitPrompt?.primaryText === baseInspection.text) {
      sections.push(...baseInspection.sections);
      droppedSections = baseInspection.droppedSections;
      truncated = baseInspection.truncated;
      maxChars = baseInspection.maxChars;
    } else if (staticPromptText || snapshot.systemPrompt) {
      sections.push(createGatewaySystemPromptSection({
        id: "runtime-system-prompt",
        label: "runtime-system-prompt",
        source: "runtime",
        priority: 145,
        text: staticPromptText || snapshot.systemPrompt,
      }));
    }

    if (snapshot.deltas && snapshot.deltas.length > 0) {
      for (const delta of snapshot.deltas) {
        deltaRecords.push({ ...delta });
      }
    }

    const deltas = deltaRecords.map(withDeltaPromptMetrics);
    const providerNativeSystemBlocks = buildPromptInspectionProviderNativeSystemBlocks({
      sections: snapshot.hookSystemPromptUsed ? undefined : sections,
      deltas: deltaRecords,
      snapshot,
      fallbackText: snapshot.systemPrompt,
    });
    const measuredSections = sections.map(withSectionPromptMetrics);
    const tokenBreakdown = buildPromptTokenBreakdown({
      systemPromptText: snapshot.systemPrompt,
      sections,
      droppedSections,
      deltas,
      providerNativeSystemBlocks,
    });
    const residentPromptMetadata = readResidentPromptMetadata(isRecord(snapshot.inputMeta) ? snapshot.inputMeta : undefined);

    return {
      scope: "run",
      agentId: snapshot.agentId ?? profile?.id ?? "default",
      displayName: profile?.displayName,
      model: profile?.model,
      conversationId: snapshot.conversationId,
      runId: snapshot.runId,
      createdAt: snapshot.createdAt,
      text: snapshot.systemPrompt,
      truncated,
      maxChars,
      totalChars: snapshot.systemPrompt.length,
      finalChars: snapshot.systemPrompt.length,
      sections: measuredSections,
      droppedSections,
      deltas,
      providerNativeSystemBlocks,
      messages: normalizePromptSnapshotMessages(snapshot.messages),
      metadata: {
        ...(baseInspection?.metadata ?? {}),
        ...residentPromptMetadata,
        snapshotScope: "run",
        snapshotCreatedAt: snapshot.createdAt,
        includesHookSystemPrompt: snapshot.hookSystemPromptUsed === true,
        hasPrependContext: Boolean(snapshot.prependContext),
        prependContextChars: snapshot.prependContext?.length ?? 0,
        includesRuntimeIdentityContext: deltas.some((delta) => delta.deltaType === "runtime-identity"),
        deltaCount: deltas.length,
        deltaChars: tokenBreakdown.deltaEstimatedChars,
        deltaTypes: [...new Set(deltas.map((delta) => delta.deltaType))],
        providerNativeSystemBlockCount: providerNativeSystemBlocks.length,
        providerNativeSystemBlockChars: tokenBreakdown.providerNativeSystemBlockEstimatedChars,
        providerNativeSystemBlockTypes: [...new Set(providerNativeSystemBlocks.map((block) => block.blockType))],
        providerNativeCacheEligibleBlockIds: providerNativeSystemBlocks
          .filter((block) => block.cacheControlEligible)
          .map((block) => block.id),
        tokenBreakdown,
        inputMeta: snapshot.inputMeta ? { ...snapshot.inputMeta } : undefined,
      },
    };
  }

  return {
    persistPromptSnapshot,
    buildEffectiveAgentPromptInspection,
    buildRunPromptInspection,
  };
}
