import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { startGatewaySupervisor } from "./gateway-supervisor.js";
import { ensurePortableRuntime } from "./portable-runtime.js";

function resolvePaths() {
  const entryFile = fileURLToPath(import.meta.url);
  const distDir = path.dirname(entryFile);
  const candidatePortableRoots = [
    path.resolve(distDir, ".."),
    path.resolve(distDir, "..", "..", "..", ".."),
  ];
  const portableRoot = candidatePortableRoots.find((candidate) => (
    fs.existsSync(path.join(candidate, "payload", "version.json"))
    || fs.existsSync(path.join(candidate, "version.json"))
  ));

  if (!portableRoot) {
    throw new Error(`Unable to resolve portable root from launcher path: ${entryFile}`);
  }

  const payloadRoot = path.join(portableRoot, "payload");
  return { payloadRoot, portableRoot };
}

function ensurePortableEnv(baseEnv: NodeJS.ProcessEnv, portableRoot: string, runtimeDir: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...baseEnv };
  env.STAR_SANCTUARY_RUNTIME_MODE = "portable";
  env.BELLDANDY_RUNTIME_MODE = "portable";
  const envDir = env.STAR_SANCTUARY_ENV_DIR
    ?? env.BELLDANDY_ENV_DIR
    ?? portableRoot;
  env.STAR_SANCTUARY_RUNTIME_DIR = runtimeDir;
  env.BELLDANDY_RUNTIME_DIR = runtimeDir;
  env.STAR_SANCTUARY_ENV_DIR = envDir;
  env.BELLDANDY_ENV_DIR = envDir;

  if (!env.BELLDANDY_AUTH_MODE) {
    const setupToken = `setup-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
    env.SETUP_TOKEN = setupToken;
    env.AUTO_OPEN_BROWSER = env.AUTO_OPEN_BROWSER || "true";
    env.BELLDANDY_AUTH_MODE = "token";
    env.BELLDANDY_AUTH_TOKEN = setupToken;
  }

  return env;
}

function startGateway() {
  const { payloadRoot, portableRoot } = resolvePaths();
  const ensuredRuntime = ensurePortableRuntime({
    portableRoot,
    payloadRoot,
  });
  const runtimeDir = ensuredRuntime.runtimeDir;
  const gatewayEntry = path.join(runtimeDir, "packages", "belldandy-core", "dist", "bin", "gateway.js");
  const env = ensurePortableEnv(process.env, portableRoot, runtimeDir);

  if (ensuredRuntime.recovered) {
    console.log(
      `[Star Sanctuary Portable] Recovered runtime from ${ensuredRuntime.payloadRoot} (reason=${ensuredRuntime.recoveryReason ?? "unknown"})`,
    );
  } else {
    console.log(`[Star Sanctuary Portable] Reusing runtime at ${runtimeDir}`);
  }

  startGatewaySupervisor({
    label: "Star Sanctuary Portable",
    gatewayEntry,
    cwd: portableRoot,
    env,
  });
}

startGateway();
