import { expect, test } from "vitest";

import { buildOptionalCapabilitiesDoctorReport } from "./optional-capabilities-doctor.js";

test("optional capability doctor warns only when active optional paths are degraded", async () => {
  const report = await buildOptionalCapabilitiesDoctorReport({
    env: {
      BELLDANDY_TOOLS_ENABLED: "true",
      BELLDANDY_EMBEDDING_ENABLED: "true",
      BELLDANDY_EMBEDDING_PROVIDER: "local",
    },
    workspaceRoot: "/workspace/star-sanctuary",
    workspacePolicyRaw: `packages:\n  - packages/*\nignoredBuiltDependencies:\n  - node-pty\n`,
    probeOptionalModule: async (moduleName, options) => {
      if (moduleName === "node-pty") {
        return {
          installed: false,
          available: false,
          checkedBy: options.load ? "load" : "resolve",
          error: "Cannot find module 'node-pty'",
        };
      }
      if (moduleName === "fastembed") {
        return {
          installed: true,
          available: false,
          checkedBy: options.load ? "load" : "resolve",
          resolvedFrom: "/workspace/node_modules/fastembed/index.js",
          error: "native binding missing",
        };
      }
      throw new Error(`unexpected module: ${moduleName}`);
    },
  });

  expect(report.summary).toMatchObject({
    totalCount: 3,
    warnCount: 3,
    degradedCount: 3,
  });
  expect(report.summary.headline).toContain("default startup remains non-blocking");
  expect(report.items).toEqual(expect.arrayContaining([
    expect.objectContaining({
      id: "pty",
      status: "warn",
      mode: "fallback",
      message: expect.stringContaining("child_process"),
    }),
    expect.objectContaining({
      id: "local_embedding",
      status: "warn",
      mode: "fallback",
      message: expect.stringContaining("fastembed"),
    }),
    expect.objectContaining({
      id: "build_scripts",
      status: "warn",
      mode: "policy_gap",
      message: expect.stringContaining("missing: onnxruntime-node, protobufjs"),
    }),
  ]));
});

test("optional capability doctor stays green for inactive optional paths with workspace policy in place", async () => {
  const report = await buildOptionalCapabilitiesDoctorReport({
    env: {
      BELLDANDY_TOOLS_ENABLED: "false",
      BELLDANDY_EMBEDDING_ENABLED: "true",
      BELLDANDY_EMBEDDING_PROVIDER: "openai",
    },
    workspaceRoot: "/workspace/star-sanctuary",
    workspacePolicyRaw: `ignoredBuiltDependencies:\n  - node-pty\n  - onnxruntime-node\n  - protobufjs\n`,
    probeOptionalModule: async (moduleName, options) => ({
      installed: false,
      available: false,
      checkedBy: options.load ? "load" : "resolve",
      error: `Cannot find module '${moduleName}'`,
    }),
  });

  expect(report.summary).toMatchObject({
    totalCount: 3,
    warnCount: 0,
    passCount: 3,
  });
  expect(report.items).toEqual(expect.arrayContaining([
    expect.objectContaining({
      id: "pty",
      status: "pass",
      message: expect.stringContaining("child_process fallback remains available"),
    }),
    expect.objectContaining({
      id: "local_embedding",
      status: "pass",
      message: "Current embedding provider is openai; local embedding remains optional.",
    }),
    expect.objectContaining({
      id: "build_scripts",
      status: "pass",
      message: expect.stringContaining("ignores non-blocking optional build-script prompts"),
    }),
  ]));
});
