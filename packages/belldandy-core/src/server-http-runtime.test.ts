import { describe, expect, it } from "vitest";

import { buildGatewayHttpRoutesContext } from "./server-http-runtime.js";
import { withEnv } from "./server-testkit.js";

function createRuntimeInput() {
  return {
    app: {} as never,
    stateDir: "E:/tmp/belldandy-test",
    log: {
      info() {},
      error() {},
    },
    options: {
      auth: { mode: "none" as const },
      webRoot: "E:/tmp/web",
      stateDir: "E:/tmp/belldandy-test",
      agentFactory: undefined,
      agentRegistry: undefined,
      webhookConfig: undefined,
      webhookIdempotency: undefined,
      onChannelSecurityApprovalRequired: undefined,
    },
    getConversationStore: (() => ({})) as never,
    getQueryRuntimeTraceStore: (() => ({})) as never,
    writeBinaryFileAtomic: (async () => {}) as never,
    writeTextFileAtomic: (async () => {}) as never,
    emitAutoRunTaskTokenResult: (() => {}) as never,
  };
}

describe("buildGatewayHttpRoutesContext governance detail mode", () => {
  it("defaults to compact when env is missing or invalid", async () => {
    await withEnv({
      BELLDANDY_WEB_GOVERNANCE_DETAIL_MODE: undefined,
    }, async () => {
      const context = buildGatewayHttpRoutesContext(createRuntimeInput());
      expect(context.webConfig?.governanceDetailMode).toBe("compact");
    });

    await withEnv({
      BELLDANDY_WEB_GOVERNANCE_DETAIL_MODE: "invalid-mode",
    }, async () => {
      const context = buildGatewayHttpRoutesContext(createRuntimeInput());
      expect(context.webConfig?.governanceDetailMode).toBe("compact");
    });
  });

  it("keeps full only when env explicitly requests full", async () => {
    await withEnv({
      BELLDANDY_WEB_GOVERNANCE_DETAIL_MODE: "full",
    }, async () => {
      const context = buildGatewayHttpRoutesContext(createRuntimeInput());
      expect(context.webConfig?.governanceDetailMode).toBe("full");
    });
  });

  it("prefers runtime getter for current governance detail mode in getWebConfig", async () => {
    await withEnv({
      BELLDANDY_WEB_GOVERNANCE_DETAIL_MODE: "compact",
    }, async () => {
      const context = buildGatewayHttpRoutesContext({
        ...createRuntimeInput(),
        getGovernanceDetailMode: () => "full",
      });
      expect(context.webConfig?.governanceDetailMode).toBe("full");
      expect(context.getWebConfig?.().governanceDetailMode).toBe("full");
    });
  });
});
