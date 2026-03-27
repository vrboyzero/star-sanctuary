import { expect, test } from "vitest";

import { buildAutoOpenTargetUrl, resolveLauncherSetupAuth } from "./launcher-auth.js";

test("authMode=none auto-open does not append token query even if setup token exists", () => {
  const resolved = resolveLauncherSetupAuth({
    authMode: "none",
    authToken: undefined,
    autoOpenBrowser: true,
    setupToken: "setup-stale-token",
  });

  expect(resolved).toEqual({ authToken: undefined });
  expect(buildAutoOpenTargetUrl({
    host: "127.0.0.1",
    port: 28889,
    authMode: "none",
    setupToken: "setup-stale-token",
  })).toBe("http://127.0.0.1:28889/");
});

test("token mode generates setup token only when auto-open is enabled and no auth token exists", () => {
  const resolved = resolveLauncherSetupAuth({
    authMode: "token",
    authToken: undefined,
    autoOpenBrowser: true,
    generateSetupToken: () => "setup-generated-token",
  });

  expect(resolved).toEqual({
    authToken: "setup-generated-token",
    setupToken: "setup-generated-token",
  });
  expect(buildAutoOpenTargetUrl({
    host: "0.0.0.0",
    port: 28889,
    authMode: "token",
    setupToken: resolved.setupToken,
  })).toBe("http://localhost:28889/?token=setup-generated-token");
});

test("token mode without auto-open keeps missing auth token unresolved", () => {
  expect(resolveLauncherSetupAuth({
    authMode: "token",
    authToken: undefined,
    autoOpenBrowser: false,
  })).toEqual({});
});
