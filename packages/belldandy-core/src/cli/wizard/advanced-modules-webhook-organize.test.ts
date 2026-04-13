import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, test } from "vitest";
import type { WebhookRule } from "../../webhook/types.js";

import {
  buildWebhookOrganizeCriteriaFromFilterMode,
  buildWebhookOrganizeSelectionLabel,
  buildWebhookOrganizePreviewLines,
  buildWebhookOrganizeStrategySaveLines,
  clearWebhookOrganizeCustomPresets,
  filterWebhookRulesForOrganize,
  getWebhookOrganizePreset,
  getWebhookOrganizeStatePath,
  listWebhookOrganizePresets,
  loadWebhookOrganizeState,
  formatWebhookOrganizeFilterLabel,
  removeWebhookOrganizeCustomPreset,
  renameWebhookOrganizeCustomPreset,
  saveWebhookOrganizeState,
  slugifyWebhookOrganizePresetLabel,
  storeWebhookOrganizeLastPreview,
  storeWebhookOrganizeLastSelection,
  summarizeWebhookOrganizeCriteria,
  upsertWebhookOrganizeCustomPreset,
} from "./advanced-modules-webhook-organize.js";

function createWebhookRule(input: Partial<WebhookRule> & Pick<WebhookRule, "id" | "token">): WebhookRule {
  return {
    id: input.id,
    token: input.token,
    enabled: input.enabled ?? true,
    ...(input.defaultAgentId ? { defaultAgentId: input.defaultAgentId } : {}),
    ...(input.conversationIdPrefix ? { conversationIdPrefix: input.conversationIdPrefix } : {}),
    ...(input.promptTemplate ? { promptTemplate: input.promptTemplate } : {}),
  };
}

describe("advanced-modules-webhook-organize", () => {
  test("filterWebhookRulesForOrganize supports status and template filters", () => {
    const rules = [
      createWebhookRule({ id: "audit", token: "token-a", enabled: true }),
      createWebhookRule({ id: "ops", token: "token-b", enabled: false, promptTemplate: "{{event}}" }),
      createWebhookRule({ id: "release", token: "token-c", enabled: true, promptTemplate: "{{status}}" }),
    ];

    expect(filterWebhookRulesForOrganize(rules, "enabled").map((rule) => rule.id)).toEqual(["audit", "release"]);
    expect(filterWebhookRulesForOrganize(rules, "disabled").map((rule) => rule.id)).toEqual(["ops"]);
    expect(filterWebhookRulesForOrganize(rules, "custom_template").map((rule) => rule.id)).toEqual(["ops", "release"]);
    expect(filterWebhookRulesForOrganize(rules, "default_template").map((rule) => rule.id)).toEqual(["audit"]);
  });

  test("formatWebhookOrganizeFilterLabel returns readable labels", () => {
    expect(formatWebhookOrganizeFilterLabel("custom_template")).toBe("webhooks with custom templates");
    expect(formatWebhookOrganizeFilterLabel("default_template")).toBe("webhooks using JSON.stringify(payload) fallback");
  });

  test("built-in presets expose combined criteria", () => {
    const presets = listWebhookOrganizePresets();

    expect(presets.map((preset) => preset.id)).toEqual([
      "disable_default_template_rules",
      "enable_disabled_custom_template_rules",
      "remove_disabled_default_template_rules",
    ]);
    expect(getWebhookOrganizePreset("enable_disabled_custom_template_rules")).toMatchObject({
      action: "enable_multiple",
      criteria: {
        enabled: "disabled",
        template: "custom_template",
      },
    });
    expect(summarizeWebhookOrganizeCriteria({
      enabled: "disabled",
      template: "default_template",
    })).toBe("disabled + JSON.stringify(payload) fallback");
  });

  test("buildWebhookOrganizePreviewLines summarizes the batch impact", () => {
    const lines = buildWebhookOrganizePreviewLines({
      action: "disable_multiple",
      selectionLabel: "Preset Disable enabled JSON fallback webhooks",
      rules: [
        createWebhookRule({ id: "audit", token: "token-a", enabled: true, defaultAgentId: "default" }),
        createWebhookRule({ id: "ops", token: "token-b", enabled: false, defaultAgentId: "ops-agent" }),
        createWebhookRule({ id: "release", token: "token-c", enabled: true, defaultAgentId: "default", promptTemplate: "{{status}}" }),
      ],
    });

    expect(lines).toContain("Action preview: disable");
    expect(lines).toContain("Matched webhooks: 3");
    expect(lines).toContain("Would disable 2 webhook(s).");
    expect(lines).toContain("Already disabled: 1");
    expect(lines).toContain("Template mix: custom 1, JSON fallback 2");
    expect(lines.some((line) => line.startsWith("Agent coverage: default, ops-agent"))).toBe(true);
  });

  test("webhook organize state persists last preview and selection", async () => {
    const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "webhook-organize-state-"));
    let state = await loadWebhookOrganizeState(stateDir);

    state = storeWebhookOrganizeLastPreview(state, {
      label: buildWebhookOrganizeSelectionLabel({
        title: "Filter custom templates",
        ruleIds: ["ops", "release"],
      }),
      action: "disable_multiple",
      webhookIds: ["ops", "release"],
    });
    state = storeWebhookOrganizeLastSelection(state, {
      label: "Picked webhooks: ops",
      webhookIds: ["ops"],
    });
    await saveWebhookOrganizeState(stateDir, state);

    const reloaded = await loadWebhookOrganizeState(stateDir);
    const savedPath = getWebhookOrganizeStatePath(stateDir);

    expect(reloaded.lastPreview).toEqual(expect.objectContaining({
      action: "disable_multiple",
      webhookIds: ["ops", "release"],
    }));
    expect(reloaded.lastSelection).toEqual(expect.objectContaining({
      label: "Picked webhooks: ops",
      webhookIds: ["ops"],
    }));
    await expect(fs.readFile(savedPath, "utf-8")).resolves.toContain("\"lastSelection\"");
  });

  test("custom presets can be upserted and managed", async () => {
    let state = await loadWebhookOrganizeState(await fs.mkdtemp(path.join(os.tmpdir(), "webhook-organize-preset-")));

    const criteria = buildWebhookOrganizeCriteriaFromFilterMode("custom_template");
    state = upsertWebhookOrganizeCustomPreset(state, {
      id: slugifyWebhookOrganizePresetLabel("Disable Custom Templates"),
      label: "Disable Custom Templates",
      action: "disable_multiple",
      criteria,
    });

    expect(state.customPresets).toEqual([
      expect.objectContaining({
        id: "disable-custom-templates",
        label: "Disable Custom Templates",
        action: "disable_multiple",
        criteria: { enabled: "any", template: "custom_template" },
      }),
    ]);

    state = renameWebhookOrganizeCustomPreset(state, "disable-custom-templates", "Pause custom templates");
    expect(state.customPresets[0]?.label).toBe("Pause custom templates");

    state = removeWebhookOrganizeCustomPreset(state, "disable-custom-templates");
    expect(state.customPresets).toEqual([]);

    state = upsertWebhookOrganizeCustomPreset(state, {
      id: "preset-a",
      label: "Preset A",
      action: "enable_multiple",
      criteria: { enabled: "disabled", template: "custom_template" },
    });
    state = upsertWebhookOrganizeCustomPreset(state, {
      id: "preset-b",
      label: "Preset B",
      action: "remove_multiple",
      criteria: { enabled: "disabled", template: "default_template" },
    });
    state = clearWebhookOrganizeCustomPresets(state);
    expect(state.customPresets).toEqual([]);
  });

  test("strategy save lines include match summary and risks", () => {
    const lines = buildWebhookOrganizeStrategySaveLines({
      mode: "saved",
      label: "Enable fallback webhooks",
      action: "enable_multiple",
      criteria: { enabled: "disabled", template: "default_template" },
      statePath: "E:\\state\\webhook-organize-state.json",
      rules: [
        createWebhookRule({ id: "audit", token: "token-a", enabled: false, defaultAgentId: "default" }),
        createWebhookRule({ id: "ops", token: "token-b", enabled: false, defaultAgentId: "ops-agent", promptTemplate: "plain text" }),
        createWebhookRule({ id: "release", token: "token-c", enabled: false, defaultAgentId: "default", promptTemplate: "{{user.name}}" }),
      ],
    });

    expect(lines).toContain("Matched now: 3 webhook(s)");
    expect(lines).toContain("Current state mix: enabled 0, disabled 3");
    expect(lines).toContain("Template mix: custom 2, JSON fallback 1");
    expect(lines).toContain("Risk: 1 matched webhook(s) still use JSON.stringify(payload) fallback.");
    expect(lines).toContain("Risk: 1 matched custom-template webhook(s) have no {{placeholders}}.");
    expect(lines).toContain("Risk: 1 matched webhook(s) use unsupported nested placeholders.");
  });
});
