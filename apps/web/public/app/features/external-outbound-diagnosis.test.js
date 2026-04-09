import { describe, expect, it } from "vitest";

import {
  buildExternalOutboundDiagnosis,
  detectExternalOutboundFailureStage,
} from "./external-outbound-diagnosis.js";

describe("external outbound diagnosis", () => {
  it("classifies resolve and delivery failures consistently", () => {
    expect(detectExternalOutboundFailureStage({ errorCode: "binding_not_found" })).toBe("resolve");
    expect(detectExternalOutboundFailureStage({ errorCode: "send_failed", targetSessionKey: "channel=feishu:chat=1" })).toBe("delivery");
    expect(detectExternalOutboundFailureStage({ errorCode: "not_found" })).toBe("confirmation");
  });

  it("builds a readable diagnosis summary", () => {
    const diagnosis = buildExternalOutboundDiagnosis({
      errorCode: "binding_not_found",
      error: "当前没有可用于 qq 的最新会话绑定。",
    });

    expect(diagnosis.failureStage).toBe("resolve");
    expect(diagnosis.summary).toContain("目标解析失败");
    expect(diagnosis.summary).toContain("binding_not_found");
    expect(diagnosis.summary).toContain("没有可用 binding");
  });

  it("keeps confirmation failures under a dedicated stage", () => {
    const diagnosis = buildExternalOutboundDiagnosis({
      errorCode: "conversation_mismatch",
      error: "当前确认请求不属于这个会话。",
    });

    expect(diagnosis.failureStage).toBe("confirmation");
    expect(diagnosis.summary).toContain("确认处理失败");
    expect(diagnosis.summary).toContain("conversation_mismatch");
  });
});
