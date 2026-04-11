import { createExternalOutboundController } from "./external-outbound.js";
import { createSettingsController } from "./settings.js";
import { createToolSettingsController } from "./tool-settings.js";

export function createSettingsRuntimeFeature({
  refs,
  isConnected,
  sendReq,
  makeId,
  setStatus,
  loadServerConfig,
  invalidateServerConfigCache,
  syncAttachmentLimitsFromConfig,
  voiceFeature,
  localeController,
  chatNetworkFeature,
  onOpenCommunityConfig,
  onOpenContinuationAction,
  getConnectionAuthMode,
  clientId,
  getSelectedAgentId,
  getActiveConversationId,
  getSelectedSubtaskId,
  isSubtasksViewActive,
  escapeHtml,
  showNotice,
  redactedPlaceholder = "[REDACTED]",
}) {
  const {
    settingsModal,
    openSettingsBtn,
    closeSettingsBtn,
    saveSettingsBtn,
    restartBtn,
    doctorStatusEl,
    cfgLocale,
    cfgApiKey,
    cfgBaseUrl,
    cfgModel,
    cfgModelPreferredProviders,
    refreshModelFallbackConfigBtn,
    modelFallbackConfigMeta,
    cfgModelFallbackContent,
    cfgExternalOutboundRequireConfirmation,
    cfgHeartbeat,
    cfgHeartbeatEnabled,
    cfgHeartbeatActiveHours,
    cfgBrowserRelayEnabled,
    cfgRelayPort,
    cfgMcpEnabled,
    cfgCronEnabled,
    cfgEmbeddingEnabled,
    cfgEmbeddingApiKey,
    cfgEmbeddingBaseUrl,
    cfgEmbeddingModel,
    cfgToolsEnabled,
    cfgAgentToolControlMode,
    cfgAgentToolControlConfirmPassword,
    cfgTtsEnabled,
    cfgTtsProvider,
    cfgTtsVoice,
    cfgDashScopeApiKey,
    cfgVoiceShortcut,
    cfgVoiceShortcutStatus,
    cfgVoiceShortcutDefault,
    cfgVoiceShortcutClear,
    cfgFacetAnchor,
    cfgInjectAgents,
    cfgInjectSoul,
    cfgInjectMemory,
    cfgMaxSystemPromptChars,
    cfgMaxHistory,
    cfgConversationKindMain,
    cfgConversationKindSubtask,
    cfgConversationKindGoal,
    cfgConversationKindHeartbeat,
    channelsSettingsSection,
    openCommunityConfigBtn,
    cfgCommunityApiEnabled,
    cfgCommunityApiToken,
    cfgFeishuAppId,
    cfgFeishuAppSecret,
    cfgFeishuAgentId,
    cfgQqAppId,
    cfgQqAppSecret,
    cfgQqAgentId,
    cfgQqSandbox,
    cfgDiscordEnabled,
    cfgDiscordBotToken,
    refreshChannelSecurityBtn,
    channelSecurityConfigMeta,
    cfgChannelSecurityContent,
    channelReplyChunkingConfigMeta,
    cfgChannelReplyChunkingContent,
    channelSecurityPendingList,
    toolSettingsConfirmModal,
    toolSettingsConfirmImpactEl,
    toolSettingsConfirmSummaryEl,
    toolSettingsConfirmExpiryEl,
    toolSettingsConfirmApproveBtn,
    toolSettingsConfirmRejectBtn,
    toolSettingsModal,
    openToolSettingsBtn,
    closeToolSettingsBtn,
    saveToolSettingsBtn,
    toolSettingsBody,
    toolTabButtons,
    externalOutboundConfirmModal,
    externalOutboundConfirmPreviewEl,
    externalOutboundConfirmTargetEl,
    externalOutboundConfirmExpiryEl,
    externalOutboundConfirmApproveBtn,
    externalOutboundConfirmRejectBtn,
  } = refs;

  const t = localeController?.t || ((_key, _params, fallback) => fallback ?? "");

  voiceFeature?.bindSettingsUI?.({
    inputEl: cfgVoiceShortcut,
    statusEl: cfgVoiceShortcutStatus,
    defaultBtn: cfgVoiceShortcutDefault,
    clearBtn: cfgVoiceShortcutClear,
  });
  localeController?.bindSelect?.(cfgLocale);

  const settingsController = createSettingsController({
    refs: {
      settingsModal,
      openSettingsBtn,
      closeSettingsBtn,
      saveSettingsBtn,
      restartBtn,
      doctorStatusEl,
      cfgLocale,
      cfgApiKey,
      cfgBaseUrl,
      cfgModel,
      cfgModelPreferredProviders,
      refreshModelFallbackConfigBtn,
      modelFallbackConfigMeta,
      cfgModelFallbackContent,
      cfgExternalOutboundRequireConfirmation,
      cfgHeartbeat,
      cfgHeartbeatEnabled,
      cfgHeartbeatActiveHours,
      cfgBrowserRelayEnabled,
      cfgRelayPort,
      cfgMcpEnabled,
      cfgCronEnabled,
      cfgEmbeddingEnabled,
      cfgEmbeddingApiKey,
      cfgEmbeddingBaseUrl,
      cfgEmbeddingModel,
      cfgToolsEnabled,
      cfgAgentToolControlMode,
      cfgAgentToolControlConfirmPassword,
      cfgTtsEnabled,
      cfgTtsProvider,
      cfgTtsVoice,
      cfgDashScopeApiKey,
      cfgFacetAnchor,
      cfgInjectAgents,
      cfgInjectSoul,
      cfgInjectMemory,
      cfgMaxSystemPromptChars,
      cfgMaxHistory,
      cfgConversationKindMain,
      cfgConversationKindSubtask,
      cfgConversationKindGoal,
      cfgConversationKindHeartbeat,
      channelsSettingsSection,
      openCommunityConfigBtn,
      cfgCommunityApiEnabled,
      cfgCommunityApiToken,
      cfgFeishuAppId,
      cfgFeishuAppSecret,
      cfgFeishuAgentId,
      cfgQqAppId,
      cfgQqAppSecret,
      cfgQqAgentId,
      cfgQqSandbox,
      cfgDiscordEnabled,
      cfgDiscordBotToken,
      refreshChannelSecurityBtn,
      channelSecurityConfigMeta,
      cfgChannelSecurityContent,
      channelReplyChunkingConfigMeta,
      cfgChannelReplyChunkingContent,
      channelSecurityPendingList,
    },
    isConnected,
    sendReq,
    makeId,
    setStatus,
    loadServerConfig,
    invalidateServerConfigCache,
    syncAttachmentLimitsFromConfig,
    onToggle: (show) => voiceFeature?.onSettingsToggle?.(show),
    getConnectionAuthMode,
    onOpenCommunityConfig,
    onModelCatalogChanged: async () => {
      await chatNetworkFeature?.loadModelList?.();
    },
    onOpenContinuationAction,
    redactedPlaceholder,
    t,
  });

  const toolSettingsController = createToolSettingsController({
    refs: {
      toolSettingsConfirmModal,
      toolSettingsConfirmImpactEl,
      toolSettingsConfirmSummaryEl,
      toolSettingsConfirmExpiryEl,
      toolSettingsConfirmApproveBtn,
      toolSettingsConfirmRejectBtn,
      toolSettingsModal,
      openToolSettingsBtn,
      closeToolSettingsBtn,
      saveToolSettingsBtn,
      toolSettingsBody,
      toolTabButtons,
    },
    isConnected,
    sendReq,
    makeId,
    clientId,
    getSelectedAgentId,
    getActiveConversationId,
    getSelectedSubtaskId,
    isSubtasksViewActive,
    escapeHtml,
    showNotice,
    t,
  });

  const externalOutboundController = createExternalOutboundController({
    refs: {
      externalOutboundConfirmModal,
      externalOutboundConfirmPreviewEl,
      externalOutboundConfirmTargetEl,
      externalOutboundConfirmExpiryEl,
      externalOutboundConfirmApproveBtn,
      externalOutboundConfirmRejectBtn,
    },
    isConnected,
    sendReq,
    makeId,
    clientId,
    escapeHtml,
    showNotice,
    t,
  });

  function toggleSettings(show) {
    void settingsController.toggle(show);
  }

  function handleChannelSecurityPending(payload) {
    const channel = typeof payload?.channel === "string" ? payload.channel : "unknown";
    const accountId = typeof payload?.accountId === "string" ? payload.accountId.trim() : "";
    const senderId = typeof payload?.senderId === "string" ? payload.senderId : "";
    const senderName = typeof payload?.senderName === "string" ? payload.senderName.trim() : "";
    const seenCount = Number.isFinite(Number(payload?.seenCount)) ? Number(payload.seenCount) : 0;
    const senderLabel = senderName || senderId || t("settings.channelSecurityPendingUnknownSender", {}, "未知 sender");
    const channelLabel = accountId ? `${channel}/${accountId}` : channel;
    if (settingsModal && !settingsModal.classList.contains("hidden")) {
      void settingsController.refreshChannelSecurityPending();
    }
    const message = seenCount > 1
      ? t(
        "settings.channelSecurityPendingNoticeRepeat",
        { channel: channelLabel, senderName: senderLabel, seenCount },
        `${channelLabel} sender ${senderLabel} 再次触发待审批，当前已拦截 ${seenCount} 次。`,
      )
      : t(
        "settings.channelSecurityPendingNoticeMessage",
        { channel: channelLabel, senderName: senderLabel },
        `${channelLabel} sender ${senderLabel} 已进入待审批队列。`,
      );
    showNotice(
      t("settings.channelSecurityPendingNoticeTitle", {}, "待审批 Sender"),
      message,
      "info",
      6800,
      {
        actionLabel: t("settings.channelSecurityPendingNoticeAction", {}, "去审批"),
        onAction: () => {
          void settingsController.openChannelSecurityPending();
        },
      },
    );
  }

  return {
    refreshLocale() {
      toolSettingsController.refreshLocale?.();
    },
    toggleSettings,
    openChannels() {
      return settingsController.openChannels();
    },
    handleChannelSecurityPending,
    handleToolSettingsConfirmRequired(payload) {
      toolSettingsController.handleConfirmRequired(payload);
    },
    handleToolSettingsConfirmResolved(payload) {
      toolSettingsController.handleConfirmResolved(payload);
    },
    handleExternalOutboundConfirmRequired(payload) {
      externalOutboundController.handleConfirmRequired(payload);
    },
    handleExternalOutboundConfirmResolved(payload) {
      externalOutboundController.handleConfirmResolved(payload);
    },
    handleToolsConfigUpdated(payload) {
      toolSettingsController.handleToolsConfigUpdated(payload);
    },
  };
}
