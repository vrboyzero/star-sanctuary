import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createSettingsController } from "./settings.js";

class FakeHTMLElement {}

class FakeButton extends FakeHTMLElement {
  constructor(attrs = {}) {
    super();
    this.attrs = attrs;
    this.disabled = false;
    this.textContent = attrs.textContent || "批准";
  }

  addEventListener() {}

  closest(selector) {
    if (selector === "button[data-pairing-action]") return this;
    return null;
  }

  getAttribute(name) {
    return this.attrs[name] ?? null;
  }
}

function createFakeList() {
  const listeners = new Map();
  return {
    innerHTML: "",
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
    trigger(type, event) {
      listeners.get(type)?.(event);
    },
    scrollIntoView: vi.fn(),
  };
}

function createFakeModal() {
  const classes = new Set(["hidden"]);
  return {
    classList: {
      add(name) {
        classes.add(name);
      },
      remove(name) {
        classes.delete(name);
      },
      contains(name) {
        return classes.has(name);
      },
    },
  };
}

function createButton(textContent = "") {
  return {
    textContent,
    disabled: false,
    addEventListener() {},
  };
}

function createInput(value = "") {
  const listeners = new Map();
  return {
    value,
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
    trigger(type) {
      listeners.get(type)?.({ target: this });
    },
  };
}

function createCheckbox(checked = false) {
  const listeners = new Map();
  return {
    checked,
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
    trigger(type) {
      listeners.get(type)?.({ target: this });
    },
  };
}

function createSettingsRefs(overrides = {}) {
  return {
    settingsModal: overrides.settingsModal || createFakeModal(),
    pairingPendingList: overrides.pairingPendingList || createFakeList(),
    saveSettingsBtn: overrides.saveSettingsBtn || createButton("保存"),
    cfgApiKey: overrides.cfgApiKey || createInput(""),
    cfgBaseUrl: overrides.cfgBaseUrl || createInput(""),
    cfgModel: overrides.cfgModel || createInput(""),
    cfgModelPreferredProviders: overrides.cfgModelPreferredProviders || createInput(""),
    cfgAssistantModeEnabled: overrides.cfgAssistantModeEnabled || createCheckbox(false),
    cfgAssistantModePreset: overrides.cfgAssistantModePreset || createInput("custom"),
    cfgExternalOutboundRequireConfirmation: overrides.cfgExternalOutboundRequireConfirmation || createCheckbox(false),
    cfgAssistantExternalDeliveryPreference: overrides.cfgAssistantExternalDeliveryPreference || createInput(""),
    cfgHeartbeat: overrides.cfgHeartbeat || createInput(""),
    cfgHeartbeatEnabled: overrides.cfgHeartbeatEnabled || createCheckbox(false),
    cfgHeartbeatActiveHours: overrides.cfgHeartbeatActiveHours || createInput(""),
    cfgBrowserRelayEnabled: overrides.cfgBrowserRelayEnabled || createCheckbox(false),
    cfgRelayPort: overrides.cfgRelayPort || createInput(""),
    cfgMcpEnabled: overrides.cfgMcpEnabled || createCheckbox(false),
    cfgCronEnabled: overrides.cfgCronEnabled || createCheckbox(false),
    cfgEmbeddingEnabled: overrides.cfgEmbeddingEnabled || createCheckbox(false),
    cfgEmbeddingApiKey: overrides.cfgEmbeddingApiKey || createInput(""),
    cfgEmbeddingBaseUrl: overrides.cfgEmbeddingBaseUrl || createInput(""),
    cfgEmbeddingModel: overrides.cfgEmbeddingModel || createInput(""),
    cfgToolsEnabled: overrides.cfgToolsEnabled || createCheckbox(false),
    cfgAgentToolControlMode: overrides.cfgAgentToolControlMode || createInput("disabled"),
    cfgAgentToolControlConfirmPassword: overrides.cfgAgentToolControlConfirmPassword || createInput(""),
    cfgTtsEnabled: overrides.cfgTtsEnabled || createCheckbox(false),
    cfgTtsProvider: overrides.cfgTtsProvider || createInput("edge"),
    cfgTtsVoice: overrides.cfgTtsVoice || createInput(""),
    cfgTtsOpenAIBaseUrl: overrides.cfgTtsOpenAIBaseUrl || createInput(""),
    cfgTtsOpenAIApiKey: overrides.cfgTtsOpenAIApiKey || createInput(""),
    cfgDashScopeApiKey: overrides.cfgDashScopeApiKey || createInput(""),
    cfgFacetAnchor: overrides.cfgFacetAnchor || createInput(""),
    cfgInjectAgents: overrides.cfgInjectAgents || createCheckbox(false),
    cfgInjectSoul: overrides.cfgInjectSoul || createCheckbox(false),
    cfgInjectMemory: overrides.cfgInjectMemory || createCheckbox(false),
    cfgMaxSystemPromptChars: overrides.cfgMaxSystemPromptChars || createInput(""),
    cfgMaxHistory: overrides.cfgMaxHistory || createInput(""),
    cfgConversationKindMain: overrides.cfgConversationKindMain || createCheckbox(false),
    cfgConversationKindSubtask: overrides.cfgConversationKindSubtask || createCheckbox(false),
    cfgConversationKindGoal: overrides.cfgConversationKindGoal || createCheckbox(false),
    cfgConversationKindHeartbeat: overrides.cfgConversationKindHeartbeat || createCheckbox(false),
    assistantModeConfigTitleEl: overrides.assistantModeConfigTitleEl || { textContent: "" },
    assistantModeConfigHelpEl: overrides.assistantModeConfigHelpEl || { textContent: "" },
    assistantModeConfigHintEl: overrides.assistantModeConfigHintEl || { textContent: "" },
  };
}

function createController(overrides = {}) {
  const refs = overrides.refs || createSettingsRefs(overrides.refsOverrides || {});
  const onApprovePairing = overrides.onApprovePairing || vi.fn().mockResolvedValue({ ok: true });
  const sendReq = overrides.sendReq || vi.fn();
  const loadServerConfig = overrides.loadServerConfig || vi.fn();
  const controller = createSettingsController({
    refs,
    isConnected: overrides.isConnected || (() => true),
    sendReq,
    makeId: overrides.makeId || (() => "req-1"),
    setStatus: overrides.setStatus || vi.fn(),
    loadServerConfig,
    invalidateServerConfigCache: overrides.invalidateServerConfigCache || vi.fn(),
    syncAttachmentLimitsFromConfig: overrides.syncAttachmentLimitsFromConfig || vi.fn(),
    getConnectionAuthMode: overrides.getConnectionAuthMode || (() => "none"),
    onApprovePairing,
    t: overrides.t,
  });
  return {
    controller,
    refs,
    pairingPendingList: refs.pairingPendingList,
    settingsModal: refs.settingsModal,
    onApprovePairing,
    sendReq,
    loadServerConfig,
  };
}

describe("settings controller", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    globalThis.HTMLElement = FakeHTMLElement;
    globalThis.document = {
      getElementById: vi.fn(() => null),
    };
    globalThis.alert = vi.fn();
    globalThis.confirm = vi.fn(() => true);
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    delete globalThis.HTMLElement;
    delete globalThis.document;
    delete globalThis.alert;
    delete globalThis.confirm;
  });

  it("renders pairing approvals inside settings", () => {
    const { controller, pairingPendingList } = createController();

    controller.renderPairingPending([
      {
        code: "ABCD1234",
        clientId: "client-1",
        message: "需要批准当前配对码。",
        updatedAt: "2026-04-12T09:30:00.000Z",
      },
    ]);

    expect(pairingPendingList.innerHTML).toContain("ABCD1234");
    expect(pairingPendingList.innerHTML).toContain("client-1");
    expect(pairingPendingList.innerHTML).toContain("批准");
  });

  it("routes pairing approval clicks through the provided handler", async () => {
    const { controller, pairingPendingList, onApprovePairing } = createController();

    controller.renderPairingPending([
      {
        code: "ABCD1234",
        message: "需要批准当前配对码。",
        updatedAt: "2026-04-12T09:30:00.000Z",
      },
    ]);

    const button = new FakeButton({
      "data-pairing-action": "approve",
      "data-pairing-code": "ABCD1234",
    });
    pairingPendingList.trigger("click", { target: button });
    await Promise.resolve();
    await Promise.resolve();

    expect(onApprovePairing).toHaveBeenCalledWith("ABCD1234");
    expect(button.disabled).toBe(true);
    expect(button.textContent).toBe("处理中...");
  });

  it("loads assistant mode config fields through settings mapping", async () => {
    const loadServerConfig = vi.fn().mockResolvedValue({
      BELLDANDY_OPENAI_BASE_URL: "https://api.example.com/v1",
      BELLDANDY_OPENAI_MODEL: "gpt-test",
      BELLDANDY_TTS_OPENAI_BASE_URL: "https://tts.example.com/v1",
      BELLDANDY_MODEL_PREFERRED_PROVIDERS: "moonshot,openrouter",
      BELLDANDY_ASSISTANT_MODE_ENABLED: "true",
      BELLDANDY_EXTERNAL_OUTBOUND_REQUIRE_CONFIRMATION: "false",
      BELLDANDY_ASSISTANT_EXTERNAL_DELIVERY_PREFERENCE: "qq,feishu",
      BELLDANDY_HEARTBEAT_INTERVAL: "45m",
      BELLDANDY_HEARTBEAT_ENABLED: "true",
      BELLDANDY_HEARTBEAT_ACTIVE_HOURS: "08:00-23:00",
      BELLDANDY_CRON_ENABLED: "true",
    });
    const { controller, refs } = createController({ loadServerConfig });

    await controller.loadConfig();

    expect(refs.assistantModeConfigTitleEl.textContent).toBe("Assistant Mode 配置");
    expect(refs.assistantModeConfigHelpEl.textContent).toContain("统一收口主动工作相关配置");
    expect(refs.assistantModeConfigHintEl.textContent).toContain("assistant mode 已启用");
    expect(refs.assistantModeConfigHintEl.textContent).toContain("主开关已显式配置");
    expect(refs.cfgBaseUrl.value).toBe("https://api.example.com/v1");
    expect(refs.cfgModel.value).toBe("gpt-test");
    expect(refs.cfgTtsOpenAIBaseUrl.value).toBe("https://tts.example.com/v1");
    expect(refs.cfgModelPreferredProviders.value).toBe("moonshot,openrouter");
    expect(refs.cfgAssistantModeEnabled.checked).toBe(true);
    expect(refs.cfgAssistantModePreset.value).toBe("custom");
    expect(refs.cfgExternalOutboundRequireConfirmation.checked).toBe(false);
    expect(refs.cfgAssistantExternalDeliveryPreference.value).toBe("qq,feishu");
    expect(refs.cfgHeartbeat.value).toBe("45m");
    expect(refs.cfgHeartbeatEnabled.checked).toBe(true);
    expect(refs.cfgHeartbeatActiveHours.value).toBe("08:00-23:00");
    expect(refs.cfgCronEnabled.checked).toBe(true);
  });

  it("saves assistant mode config fields through settings mapping", async () => {
    const refs = createSettingsRefs({
      cfgBaseUrl: createInput("https://api.example.com/v1"),
      cfgModel: createInput("gpt-test"),
      cfgTtsOpenAIBaseUrl: createInput("https://tts.example.com/v1"),
      cfgTtsOpenAIApiKey: createInput("tts-openai-key"),
      cfgAssistantModeEnabled: createCheckbox(true),
      cfgAssistantModePreset: createInput("custom"),
      cfgExternalOutboundRequireConfirmation: createCheckbox(true),
      cfgAssistantExternalDeliveryPreference: createInput(" community,discord "),
      cfgHeartbeat: createInput(" 15m "),
      cfgHeartbeatEnabled: createCheckbox(true),
      cfgHeartbeatActiveHours: createInput(" 09:00-18:00 "),
      cfgCronEnabled: createCheckbox(true),
    });
    const sendReq = vi.fn(async (frame) => {
      switch (frame.method) {
        case "config.update":
          return { ok: true, payload: {} };
        case "channel.security.get":
          return { ok: true, payload: { path: "channel-security.json", content: '{\n  "version": 1,\n  "channels": {}\n}\n' } };
        case "channel.reply_chunking.get":
          return { ok: true, payload: { path: "channel-reply-chunking.json", content: '{\n  "version": 1,\n  "channels": {}\n}\n' } };
        case "channel.security.pending.list":
          return { ok: true, payload: { pending: [] } };
        default:
          return { ok: true, payload: {} };
      }
    });
    const { controller } = createController({ refs, sendReq });

    await controller.saveConfig();
    vi.runAllTimers();

    const updateCall = sendReq.mock.calls.find(([frame]) => frame.method === "config.update");
    expect(updateCall?.[0]?.params?.updates).toMatchObject({
      BELLDANDY_OPENAI_BASE_URL: "https://api.example.com/v1",
      BELLDANDY_OPENAI_MODEL: "gpt-test",
      BELLDANDY_TTS_OPENAI_BASE_URL: "https://tts.example.com/v1",
      BELLDANDY_TTS_OPENAI_API_KEY: "tts-openai-key",
      BELLDANDY_ASSISTANT_MODE_ENABLED: "true",
      BELLDANDY_EXTERNAL_OUTBOUND_REQUIRE_CONFIRMATION: "true",
      BELLDANDY_ASSISTANT_EXTERNAL_DELIVERY_PREFERENCE: "community,discord",
      BELLDANDY_HEARTBEAT_INTERVAL: "15m",
      BELLDANDY_HEARTBEAT_ENABLED: "true",
      BELLDANDY_HEARTBEAT_ACTIVE_HOURS: "09:00-18:00",
      BELLDANDY_CRON_ENABLED: "true",
    });
  });

  it("applies assistant mode preset as a shortcut without persisting a separate mode field", () => {
    const refs = createSettingsRefs({
      cfgAssistantModePreset: createInput("custom"),
      cfgAssistantModeEnabled: createCheckbox(false),
      cfgExternalOutboundRequireConfirmation: createCheckbox(false),
      cfgAssistantExternalDeliveryPreference: createInput("qq,discord"),
      cfgHeartbeat: createInput("90m"),
      cfgHeartbeatEnabled: createCheckbox(false),
      cfgHeartbeatActiveHours: createInput("10:00-18:00"),
      cfgCronEnabled: createCheckbox(false),
    });
    createController({ refs });

    refs.cfgAssistantModePreset.value = "standard";
    refs.cfgAssistantModePreset.trigger("change");

    expect(refs.cfgAssistantModeEnabled.checked).toBe(true);
    expect(refs.cfgExternalOutboundRequireConfirmation.checked).toBe(true);
    expect(refs.cfgAssistantExternalDeliveryPreference.value).toBe("feishu,qq,community,discord");
    expect(refs.cfgHeartbeat.value).toBe("30m");
    expect(refs.cfgHeartbeatEnabled.checked).toBe(true);
    expect(refs.cfgHeartbeatActiveHours.value).toBe("");
    expect(refs.cfgCronEnabled.checked).toBe(true);
    expect(refs.cfgAssistantModePreset.value).toBe("standard");
  });

  it("marks assistant mode reads as pairing-blocked", () => {
    const { controller, refs } = createController();

    controller.markPairingRequired();

    expect(refs.assistantModeConfigHintEl.textContent).toContain("先完成当前 WebChat 会话的 Pairing");
  });

  it("turns off heartbeat and cron when assistant mode master switch is disabled before save", async () => {
    const refs = createSettingsRefs({
      cfgAssistantModeEnabled: createCheckbox(false),
      cfgHeartbeatEnabled: createCheckbox(true),
      cfgCronEnabled: createCheckbox(true),
    });
    const sendReq = vi.fn(async (frame) => {
      switch (frame.method) {
        case "config.update":
          return { ok: true, payload: {} };
        case "channel.security.get":
        case "channel.reply_chunking.get":
          return { ok: true, payload: { path: "ok.json", content: '{\n  "version": 1,\n  "channels": {}\n}\n' } };
        case "channel.security.pending.list":
          return { ok: true, payload: { pending: [] } };
        default:
          return { ok: true, payload: {} };
      }
    });
    const { controller } = createController({ refs, sendReq });

    await controller.saveConfig();

    const updateCall = sendReq.mock.calls.find(([frame]) => frame.method === "config.update");
    expect(updateCall?.[0]?.params?.updates).toMatchObject({
      BELLDANDY_ASSISTANT_MODE_ENABLED: "false",
      BELLDANDY_HEARTBEAT_ENABLED: "false",
      BELLDANDY_CRON_ENABLED: "false",
    });
  });
});
