import { describe, expect, test } from "vitest";

import {
  parseBooleanEnv,
  removeModelFallbackProfile,
  removeWebhookRule,
  validateHeartbeatInterval,
  validateHttpUrl,
  validateWebhookId,
  upsertModelFallbackProfile,
  upsertWebhookRule,
} from "./advanced-modules-shared.js";

describe("advanced-modules-shared", () => {
  test("upsertModelFallbackProfile updates existing fallback by id", () => {
    const next = upsertModelFallbackProfile({
      fallbacks: [{
        id: "backup",
        baseUrl: "https://old.example/v1",
        apiKey: "sk-old",
        model: "old-model",
      }],
    }, {
      id: "backup",
      displayName: "Backup Route",
      baseUrl: "https://new.example/v1",
      apiKey: "sk-new",
      model: "new-model",
    });

    expect(next.fallbacks).toEqual([{
      id: "backup",
      displayName: "Backup Route",
      baseUrl: "https://new.example/v1",
      apiKey: "sk-new",
      model: "new-model",
    }]);
  });

  test("upsertWebhookRule appends new rules and preserves version", () => {
    const next = upsertWebhookRule({
      version: 1,
      webhooks: [],
    }, {
      id: "audit",
      enabled: true,
      token: "secret-token",
      defaultAgentId: "default",
    });

    expect(next).toEqual({
      version: 1,
      webhooks: [{
        id: "audit",
        enabled: true,
        token: "secret-token",
        defaultAgentId: "default",
      }],
    });
  });

  test("removeModelFallbackProfile removes a single fallback by id", () => {
    const next = removeModelFallbackProfile({
      fallbacks: [
        {
          id: "backup-a",
          baseUrl: "https://a.example/v1",
          apiKey: "sk-a",
          model: "model-a",
        },
        {
          id: "backup-b",
          baseUrl: "https://b.example/v1",
          apiKey: "sk-b",
          model: "model-b",
        },
      ],
    }, "backup-a");

    expect(next.fallbacks).toEqual([{
      id: "backup-b",
      baseUrl: "https://b.example/v1",
      apiKey: "sk-b",
      model: "model-b",
    }]);
  });

  test("removeWebhookRule removes a single rule by id", () => {
    const next = removeWebhookRule({
      version: 1,
      webhooks: [
        {
          id: "audit",
          enabled: true,
          token: "token-a",
        },
        {
          id: "sync",
          enabled: false,
          token: "token-b",
        },
      ],
    }, "audit");

    expect(next).toEqual({
      version: 1,
      webhooks: [{
        id: "sync",
        enabled: false,
        token: "token-b",
      }],
    });
  });

  test("parseBooleanEnv falls back for unsupported values", () => {
    expect(parseBooleanEnv("true", false)).toBe(true);
    expect(parseBooleanEnv("false", true)).toBe(false);
    expect(parseBooleanEnv("maybe", true)).toBe(true);
    expect(parseBooleanEnv(undefined, false)).toBe(false);
  });

  test("validateHttpUrl accepts http(s) urls and rejects invalid values", () => {
    expect(validateHttpUrl("https://api.openai.com/v1", "Base URL")).toBeUndefined();
    expect(validateHttpUrl("http://127.0.0.1:8787", "Base URL")).toBeUndefined();
    expect(validateHttpUrl("ftp://example.com", "Base URL")).toBe("Base URL must use http or https");
    expect(validateHttpUrl("not-a-url", "Base URL")).toBe("Base URL must be a valid http(s) URL");
  });

  test("validateWebhookId rejects unsafe path fragments", () => {
    expect(validateWebhookId("audit")).toBeUndefined();
    expect(validateWebhookId("release_hook.v2")).toBeUndefined();
    expect(validateWebhookId("audit/run")).toBe("Webhook id may only contain letters, numbers, dot, underscore, or dash");
    expect(validateWebhookId("")).toBe("Webhook id is required");
  });

  test("validateHeartbeatInterval matches gateway parser format", () => {
    expect(validateHeartbeatInterval("30m")).toBeUndefined();
    expect(validateHeartbeatInterval("1h")).toBeUndefined();
    expect(validateHeartbeatInterval("45s")).toBeUndefined();
    expect(validateHeartbeatInterval("15")).toBeUndefined();
    expect(validateHeartbeatInterval("0m")).toBe("Heartbeat interval must be greater than 0");
    expect(validateHeartbeatInterval("every 5 minutes")).toBe("Heartbeat interval must be like 30m, 1h, or 45s");
  });
});
