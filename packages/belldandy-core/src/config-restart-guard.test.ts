import { describe, expect, it } from "vitest";

import {
  isConfigFileRestartSuppressed,
  resetSuppressedConfigFileRestarts,
  suppressConfigFileRestart,
} from "./config-restart-guard.js";

describe("config restart guard", () => {
  it("suppresses restart for the targeted config file within the window", () => {
    resetSuppressedConfigFileRestarts();
    expect(isConfigFileRestartSuppressed(".env.local")).toBe(false);
    suppressConfigFileRestart(".env.local", 5000);
    expect(isConfigFileRestartSuppressed(".env.local")).toBe(true);
    expect(isConfigFileRestartSuppressed(".env")).toBe(false);
  });
});
