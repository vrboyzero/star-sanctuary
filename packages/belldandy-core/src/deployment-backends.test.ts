import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { expect, test } from "vitest";

import {
  buildDefaultDeploymentBackendsConfig,
  buildDeploymentBackendsDoctorReport,
  ensureDeploymentBackendsConfig,
  normalizeDeploymentBackendsConfig,
  resolveDeploymentBackendsConfigPath,
} from "./deployment-backends.js";

test("normalizeDeploymentBackendsConfig fills backend-specific defaults", () => {
  const config = normalizeDeploymentBackendsConfig({
    selectedProfileId: "docker-main",
    profiles: [
      {
        id: "docker-main",
        backend: "docker",
        runtime: {
          service: "belldandy-gateway",
        },
        workspace: {},
        credentials: {},
        observability: {},
      },
      {
        id: "ssh-main",
        backend: "ssh",
        runtime: {
          host: "gateway.internal",
        },
        workspace: {
          remotePath: "/srv/star-sanctuary",
        },
      },
    ],
  });

  expect(config.selectedProfileId).toBe("docker-main");
  expect(config.profiles).toMatchObject([
    {
      id: "docker-main",
      backend: "docker",
      enabled: true,
      workspace: {
        mode: "mount",
      },
      credentials: {
        mode: "inherit_env",
      },
      observability: {
        logMode: "docker",
      },
    },
    {
      id: "ssh-main",
      backend: "ssh",
      workspace: {
        mode: "sync",
        remotePath: "/srv/star-sanctuary",
      },
      credentials: {
        mode: "ssh_agent",
      },
      observability: {
        logMode: "ssh",
      },
    },
  ]);
});

test("buildDeploymentBackendsDoctorReport summarizes warnings and selected profile", async () => {
  const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-deployment-backends-"));
  try {
    await fs.promises.writeFile(resolveDeploymentBackendsConfigPath(stateDir), `${JSON.stringify({
      version: 1,
      selectedProfileId: "ssh-main",
      profiles: [
        buildDefaultDeploymentBackendsConfig().profiles[0],
        {
          id: "docker-main",
          backend: "docker",
          enabled: true,
          runtime: {
            service: "belldandy-gateway",
          },
          workspace: {
            mode: "mount",
            remotePath: "/workspace",
          },
          credentials: {
            mode: "env_file",
          },
          observability: {
            logMode: "docker",
          },
        },
        {
          id: "ssh-main",
          backend: "ssh",
          enabled: true,
          runtime: {
            user: "admin",
          },
          workspace: {
            mode: "sync",
          },
          credentials: {
            mode: "ssh_key",
          },
          observability: {
            logMode: "file",
          },
        },
      ],
    }, null, 2)}\n`, "utf-8");

    const report = buildDeploymentBackendsDoctorReport({ stateDir });
    expect(report.summary).toMatchObject({
      profileCount: 3,
      enabledCount: 3,
      warningCount: 2,
      selectedProfileId: "ssh-main",
      selectedResolved: true,
      selectedBackend: "ssh",
      backendCounts: {
        local: 1,
        docker: 1,
        ssh: 1,
      },
    });
    expect(report.items.find((item) => item.id === "docker-main")).toMatchObject({
      status: "warn",
      warnings: expect.arrayContaining(["docker env_file credentials need credentials.ref"]),
    });
    expect(report.items.find((item) => item.id === "ssh-main")).toMatchObject({
      selected: true,
      status: "warn",
      warnings: expect.arrayContaining([
        "ssh backend needs runtime.host",
        "ssh_key credentials need credentials.ref",
        "file logMode needs observability.ref",
      ]),
    });
  } finally {
    await fs.promises.rm(stateDir, { recursive: true, force: true }).catch(() => {});
  }
});

test("ensureDeploymentBackendsConfig creates default config when missing", async () => {
  const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-deployment-backends-"));
  try {
    const configPath = resolveDeploymentBackendsConfigPath(stateDir);
    expect(fs.existsSync(configPath)).toBe(false);
    await ensureDeploymentBackendsConfig(stateDir);
    expect(fs.existsSync(configPath)).toBe(true);

    const report = buildDeploymentBackendsDoctorReport({ stateDir });
    expect(report.summary).toMatchObject({
      profileCount: 1,
      enabledCount: 1,
      warningCount: 0,
      selectedProfileId: "local-default",
      selectedResolved: true,
      selectedBackend: "local",
    });
  } finally {
    await fs.promises.rm(stateDir, { recursive: true, force: true }).catch(() => {});
  }
});
