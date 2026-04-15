import { describe, expect, it } from "vitest";

import {
  applyAssistantModeSettingsViewModel,
  buildAssistantModeSettingsViewModel,
} from "./assistant-mode-settings-view-model.js";

describe("assistant mode settings view model", () => {
  it("builds shared assistant mode copy for config section", () => {
    expect(buildAssistantModeSettingsViewModel()).toEqual({
      configTitle: "Assistant Mode 配置",
      configHelp: "统一收口主动工作相关配置，包括策略预设、通知确认、外发优先级、heartbeat 活跃时段和 cron 自动调度。底层仍复用现有 runtime。",
      configHint: "配置入口已收口在下方 Assistant Mode 配置；当前仍复用原有 heartbeat / cron / 外部确认 runtime。",
      presetOptions: [
        { value: "custom", label: "自定义" },
        { value: "conservative", label: "保守" },
        { value: "standard", label: "标准" },
        { value: "proactive", label: "主动" },
      ],
      currentPreset: "custom",
    });
  });

  it("builds assistant mode summary hint from current settings", () => {
    const hint = buildAssistantModeSettingsViewModel(undefined, {
      settings: {
        assistantModeEnabled: true,
        assistantModeSource: "explicit",
        assistantModeMismatch: false,
        effectiveEnabled: true,
        confirmationRequired: true,
        externalDeliveryPreference: "qq,feishu",
        heartbeatInterval: "45m",
        heartbeatEnabled: true,
        heartbeatActiveHours: "08:00-23:00",
        cronEnabled: false,
      },
    }).configHint;

    expect(hint).toContain("assistant mode 已启用（主动驱动：heartbeat）");
    expect(hint).toContain("主开关已显式配置");
    expect(hint).toContain("当前预设 自定义");
    expect(hint).toContain("heartbeat 已启用（45m，08:00-23:00）");
    expect(hint).toContain("cron 已关闭");
    expect(hint).toContain("外发确认 需要确认");
    expect(hint).toContain("外发优先级 resident + qq > feishu");
  });

  it("builds pairing-required hint when settings reads are blocked", () => {
    expect(buildAssistantModeSettingsViewModel(undefined, {
      pairingRequired: true,
    }).configHint).toContain("先完成当前 WebChat 会话的 Pairing");
  });

  it("applies shared assistant mode copy to config section refs", () => {
    const refs = {
      assistantModeConfigTitleEl: { textContent: "" },
      assistantModeConfigHelpEl: { textContent: "" },
      assistantModeConfigHintEl: { textContent: "" },
    };

    const viewModel = applyAssistantModeSettingsViewModel(refs);

    expect(viewModel.configTitle).toBe("Assistant Mode 配置");
    expect(refs.assistantModeConfigTitleEl.textContent).toBe("Assistant Mode 配置");
    expect(refs.assistantModeConfigHelpEl.textContent).toContain("统一收口主动工作相关配置");
    expect(refs.assistantModeConfigHintEl.textContent).toContain("配置入口已收口");
  });
});
