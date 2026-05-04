import { beforeEach, describe, expect, it } from "vitest";

import {
  persistSessionAuthToken,
  restoreSessionAuthToken,
} from "./persistence.js";

function createStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
    clear() {
      values.clear();
    },
  };
}

describe("session auth token persistence", () => {
  beforeEach(() => {
    globalThis.sessionStorage = createStorage();
  });

  it("restores a session token into auth controls", () => {
    globalThis.sessionStorage.setItem("test.session.auth", "token-from-session");
    const authModeEl = { value: "none" };
    const authValueEl = { value: "" };

    const restored = restoreSessionAuthToken({
      sessionStoreKey: "test.session.auth",
      authModeEl,
      authValueEl,
    });

    expect(restored).toBe("token-from-session");
    expect(authModeEl.value).toBe("token");
    expect(authValueEl.value).toBe("token-from-session");
  });

  it("persists the current token into session storage", () => {
    const authModeEl = { value: "token" };
    const authValueEl = { value: "current-runtime-token" };

    persistSessionAuthToken({
      sessionStoreKey: "test.session.auth",
      authModeEl,
      authValueEl,
    });

    expect(globalThis.sessionStorage.getItem("test.session.auth")).toBe("current-runtime-token");
  });

  it("clears the session token when auth mode changes away from token", () => {
    globalThis.sessionStorage.setItem("test.session.auth", "stale-token");
    const authModeEl = { value: "none" };
    const authValueEl = { value: "" };

    persistSessionAuthToken({
      sessionStoreKey: "test.session.auth",
      authModeEl,
      authValueEl,
    });

    expect(globalThis.sessionStorage.getItem("test.session.auth")).toBeNull();
  });
});
