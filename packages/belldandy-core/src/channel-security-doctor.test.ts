import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { buildChannelSecurityDoctorReport } from "./channel-security-doctor.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("channel security doctor", () => {
  it("warns when an enabled channel has no explicit security policy", async () => {
    const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "belldandy-channel-security-doctor-"));
    tempDirs.push(stateDir);

    const report = buildChannelSecurityDoctorReport({
      stateDir,
      channels: {
        discord: { enabled: true },
        feishu: { enabled: false },
        qq: { enabled: false },
        community: { enabled: false },
      },
    });

    expect(report.summary.enabledChannelCount).toBe(1);
    expect(report.summary.warningCount).toBe(1);
    expect(report.items).toEqual([
      expect.objectContaining({
        channel: "discord",
        status: "warn",
        message: expect.stringContaining("no channel-security policy"),
      }),
    ]);
  });

  it("passes when allowlist and mention defaults are both configured", async () => {
    const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "belldandy-channel-security-doctor-"));
    tempDirs.push(stateDir);
    await fs.writeFile(path.join(stateDir, "channel-security.json"), JSON.stringify({
      channels: {
        discord: {
          dmPolicy: "allowlist",
          allowFrom: ["u-safe"],
          mentionRequired: {
            channel: true,
          },
        },
      },
    }, null, 2), "utf-8");

    const report = buildChannelSecurityDoctorReport({
      stateDir,
      channels: {
        discord: { enabled: true },
        feishu: { enabled: false },
        qq: { enabled: false },
        community: { enabled: false },
      },
    });

    expect(report.summary.warningCount).toBe(0);
    expect(report.items).toEqual([
      expect.objectContaining({
        channel: "discord",
        status: "pass",
        message: expect.stringContaining("dm=allowlist"),
      }),
    ]);
  });

  it("supports per-account community policy checks", async () => {
    const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "belldandy-channel-security-doctor-"));
    tempDirs.push(stateDir);
    await fs.writeFile(path.join(stateDir, "channel-security.json"), JSON.stringify({
      channels: {
        community: {
          accounts: {
            alpha: {
              dmPolicy: "allowlist",
              allowFrom: ["u-safe"],
              mentionRequired: {
                room: true,
              },
            },
          },
        },
      },
    }, null, 2), "utf-8");

    const report = buildChannelSecurityDoctorReport({
      stateDir,
      channels: {
        discord: { enabled: false },
        feishu: { enabled: false },
        qq: { enabled: false },
        community: { enabled: true, accountIds: ["alpha"] },
      },
    });

    expect(report.summary.warningCount).toBe(0);
    expect(report.items).toEqual([
      expect.objectContaining({
        channel: "community",
        status: "pass",
        message: expect.stringContaining("accounts=1"),
      }),
    ]);
  });
});
