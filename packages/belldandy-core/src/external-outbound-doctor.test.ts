import { describe, expect, it } from "vitest";

import { buildExternalOutboundDoctorReport } from "./external-outbound-doctor.js";

describe("external outbound doctor", () => {
  it("summarizes recent failures by stage and error code", async () => {
    const report = await buildExternalOutboundDoctorReport({
      auditStore: {
        async append() {},
        async listRecent() {
          return [
            {
              timestamp: 3,
              sourceConversationId: "conv-1",
              sourceChannel: "webchat" as const,
              targetChannel: "feishu" as const,
              targetSessionKey: "channel=feishu:chat=chat-1",
              resolution: "latest_binding" as const,
              decision: "confirmed" as const,
              delivery: "sent" as const,
              contentPreview: "ok",
            },
            {
              timestamp: 2,
              sourceConversationId: "conv-1",
              sourceChannel: "webchat" as const,
              targetChannel: "qq" as const,
              requestedSessionKey: "channel=qq:chat=chat-2",
              resolution: "explicit_session_key" as const,
              decision: "auto_approved" as const,
              delivery: "failed" as const,
              contentPreview: "resolve fail",
              errorCode: "binding_not_found",
              error: "not found",
            },
            {
              timestamp: 1,
              sourceConversationId: "conv-2",
              sourceChannel: "webchat" as const,
              targetChannel: "discord" as const,
              targetSessionKey: "channel=discord:chat=room-1",
              resolution: "latest_binding" as const,
              decision: "confirmed" as const,
              delivery: "failed" as const,
              contentPreview: "delivery fail",
              errorCode: "send_failed",
              error: "send failed",
            },
          ];
        },
      },
      requireConfirmation: true,
    });

    expect(report.headline).toContain("records=3");
    expect(report.totals.sentCount).toBe(1);
    expect(report.totals.failedCount).toBe(2);
    expect(report.totals.resolveFailedCount).toBe(1);
    expect(report.totals.deliveryFailedCount).toBe(1);
    expect(report.errorCodeCounts).toMatchObject({
      binding_not_found: 1,
      send_failed: 1,
    });
    expect(report.recentFailures[0]).toMatchObject({
      targetChannel: "qq",
      failureStage: "resolve",
      errorCode: "binding_not_found",
    });
    expect(report.failureStageCounts).toMatchObject({
      resolve: 1,
      delivery: 1,
      confirmation: 0,
    });
  });
});
