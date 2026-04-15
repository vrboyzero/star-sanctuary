import { beforeEach, describe, expect, it, vi } from "vitest";

const createSettingsControllerMock = vi.fn(() => ({
  toggle: vi.fn(),
  renderPairingPending: vi.fn(),
  refreshChannelSecurityPending: vi.fn(),
  openPairingPending: vi.fn(),
  openChannels: vi.fn(),
  openChannelSecurityPending: vi.fn(),
  markPairingRequired: vi.fn(),
}));
const createToolSettingsControllerMock = vi.fn(() => ({
  refreshLocale: vi.fn(),
  handleConfirmRequired: vi.fn(),
  handleConfirmResolved: vi.fn(),
  handleToolsConfigUpdated: vi.fn(),
}));
const createExternalOutboundControllerMock = vi.fn(() => ({
  handleConfirmRequired: vi.fn(),
  handleConfirmResolved: vi.fn(),
}));
const createEmailOutboundControllerMock = vi.fn(() => ({
  handleConfirmRequired: vi.fn(),
  handleConfirmResolved: vi.fn(),
}));

vi.mock("./settings.js", () => ({
  createSettingsController: (...args) => createSettingsControllerMock(...args),
}));

vi.mock("./tool-settings.js", () => ({
  createToolSettingsController: (...args) => createToolSettingsControllerMock(...args),
}));

vi.mock("./external-outbound.js", () => ({
  createExternalOutboundController: (...args) => createExternalOutboundControllerMock(...args),
}));

vi.mock("./email-outbound.js", () => ({
  createEmailOutboundController: (...args) => createEmailOutboundControllerMock(...args),
}));

import { createSettingsRuntimeFeature } from "./settings-runtime.js";

function createRefs() {
  return {
    settingsModal: {
      classList: {
        contains: vi.fn(() => true),
        remove: vi.fn(),
        add: vi.fn(),
      },
    },
    cfgAssistantModeEnabled: { id: "assistant-mode-master" },
    cfgHeartbeatEnabled: { id: "heartbeat-enabled" },
    cfgCronEnabled: { id: "cron-enabled" },
    pairingPendingList: { addEventListener: vi.fn() },
    channelSecurityPendingList: { addEventListener: vi.fn() },
  };
}

describe("settings runtime feature", () => {
  beforeEach(() => {
    createSettingsControllerMock.mockClear();
    createToolSettingsControllerMock.mockClear();
    createExternalOutboundControllerMock.mockClear();
    createEmailOutboundControllerMock.mockClear();
  });

  it("passes assistant mode master switch ref into settings controller", () => {
    const refs = createRefs();

    createSettingsRuntimeFeature({
      refs,
      isConnected: () => true,
      sendReq: vi.fn(),
      makeId: () => "req-1",
      setStatus: vi.fn(),
      loadServerConfig: vi.fn(),
      invalidateServerConfigCache: vi.fn(),
      syncAttachmentLimitsFromConfig: vi.fn(),
      localeController: { t: (_key, _params, fallback) => fallback ?? "" },
      getConnectionAuthMode: () => "token",
      clientId: "client-1",
      getSelectedAgentId: () => null,
      getActiveConversationId: () => null,
      getSelectedSubtaskId: () => null,
      isSubtasksViewActive: () => false,
      escapeHtml: (value) => String(value ?? ""),
      showNotice: vi.fn(),
    });

    expect(createSettingsControllerMock).toHaveBeenCalledTimes(1);
    expect(createSettingsControllerMock.mock.calls[0][0].refs.cfgAssistantModeEnabled).toBe(
      refs.cfgAssistantModeEnabled,
    );
  });
});
