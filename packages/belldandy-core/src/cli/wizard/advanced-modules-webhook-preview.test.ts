import { describe, expect, test } from "vitest";

import {
  buildWebhookPayloadComparisonLines,
  buildWebhookPayloadSchemaLines,
  buildWebhookRequestPreviewComparisonLines,
  buildWebhookRequestPreviewLines,
} from "./advanced-modules-webhook-preview.js";

describe("advanced-modules-webhook-preview", () => {
  test("buildWebhookPayloadSchemaLines infers top-level schema from sample payload", () => {
    expect(buildWebhookPayloadSchemaLines({
      event: "deploy",
      status: "ok",
      count: 3,
      success: true,
      meta: { user: "ops", region: "cn" },
      tags: ["release", "prod"],
    })).toEqual([
      "Payload schema:",
      "- count: integer (3)",
      "- event: string (\"deploy\")",
      "- meta: object{region, user}",
      "- meta.region: string (\"cn\")",
      "- meta.user: string (\"ops\")",
      "- status: string (\"ok\")",
      "- success: boolean (true)",
      "- tags: array<string> (2 items)",
    ]);
  });

  test("buildWebhookRequestPreviewLines summarizes effective request routing", () => {
    expect(buildWebhookRequestPreviewLines({
      rule: {
        id: "audit",
        defaultAgentId: "ops",
        conversationIdPrefix: "webhook:ops",
        promptTemplate: "{{event}} {{status}}",
      },
      payload: {
        event: "deploy",
        user: { name: "ops" },
      },
      resolvedPrompt: "deploy {{status}}",
    })).toEqual([
      "Method: POST",
      "Route: /api/webhook/audit",
      "Auth: Bearer <webhook token>",
      "Default agent: ops",
      "Conversation id handling: auto-generated from prefix webhook:ops unless request.conversationId overrides it",
      "Prompt source: custom template",
      "Payload keys: event, user",
      "Template coverage: resolved 1/2 top-level placeholders",
      "Missing top-level fields for template: status",
      "Request body preview: {\"payload\":{\"event\":\"deploy\",\"user\":{\"name\":\"ops\"}}}",
      "Resolved prompt preview: deploy {{status}}",
    ]);
  });

  test("buildWebhookRequestPreviewLines flags unsupported placeholders", () => {
    expect(buildWebhookRequestPreviewLines({
      rule: {
        id: "audit",
        promptTemplate: "{{event}} {{user.name}}",
      },
      payload: {
        event: "deploy",
        user: { name: "ops" },
      },
      resolvedPrompt: "deploy {{user.name}}",
    })).toContain("Unsupported placeholders in template: user.name");
  });

  test("buildWebhookPayloadComparisonLines summarizes differences across samples", () => {
    expect(buildWebhookPayloadComparisonLines([
      {
        event: "deploy",
        status: "ok",
      },
      {
        event: "deploy",
        user: { name: "ops" },
      },
    ])).toEqual([
      "Compared payload samples: 2",
      "Common top-level keys: event",
      "Union top-level keys: event, status, user",
      "Sample 1 keys: event, status",
      "Sample 1 schema highlights: event=string (\"deploy\"); status=string (\"ok\")",
      "Sample 2 keys: event, user",
      "Sample 2 schema highlights: event=string (\"deploy\"); user=object{name}; user.name=string (\"ops\")",
    ]);
  });

  test("buildWebhookRequestPreviewComparisonLines compares multiple samples", () => {
    expect(buildWebhookRequestPreviewComparisonLines({
      rule: {
        id: "audit",
        defaultAgentId: "ops",
        conversationIdPrefix: "webhook:ops",
        promptTemplate: "{{event}} {{status}}",
      },
      samples: [
        {
          payload: { event: "deploy", status: "ok" },
          resolvedPrompt: "deploy ok",
        },
        {
          payload: { event: "deploy", user: { name: "ops" } },
          resolvedPrompt: "deploy {{status}}",
        },
      ],
    })).toEqual([
      "Method: POST",
      "Route: /api/webhook/audit",
      "Auth: Bearer <webhook token>",
      "Default agent: ops",
      "Conversation id handling: auto-generated from prefix webhook:ops unless request.conversationId overrides it",
      "Prompt source: custom template",
      "Compared request samples: 2",
      "Sample 1 payload keys: event, status",
      "Sample 1 Payload keys: event, status",
      "Sample 1 Template coverage: resolved 2/2 top-level placeholders",
      "Sample 1 Request body preview: {\"payload\":{\"event\":\"deploy\",\"status\":\"ok\"}}",
      "Sample 1 Resolved prompt preview: deploy ok",
      "Sample 2 payload keys: event, user",
      "Sample 2 Payload keys: event, user",
      "Sample 2 Template coverage: resolved 1/2 top-level placeholders",
      "Sample 2 Missing top-level fields for template: status",
      "Sample 2 Request body preview: {\"payload\":{\"event\":\"deploy\",\"user\":{\"name\":\"ops\"}}}",
      "Sample 2 Resolved prompt preview: deploy {{status}}",
    ]);
  });
});
