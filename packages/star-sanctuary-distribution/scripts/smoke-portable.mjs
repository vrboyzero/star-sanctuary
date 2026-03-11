import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { getModeLogSuffix, resolveDistributionMode, resolvePortableArtifactRoot } from "./distribution-mode.mjs";

const workspaceRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")), "..", "..", "..");
const platform = process.platform;
const arch = process.arch;
const distribution = resolveDistributionMode();
const { mode } = distribution;
const suffix = getModeLogSuffix(mode);
const portableRoot = resolvePortableArtifactRoot({
  workspaceRoot,
  platform,
  arch,
  mode,
});
const executablePath = path.join(portableRoot, "star-sanctuary.exe");
const entryScript = path.join(portableRoot, "launcher", "portable-entry.js");
const stateDir = path.join(workspaceRoot, "artifacts", `portable-state-smoke${suffix}`);
const stdoutPath = path.join(workspaceRoot, "artifacts", `portable-smoke${suffix}.stdout.log`);
const stderrPath = path.join(workspaceRoot, "artifacts", `portable-smoke${suffix}.stderr.log`);

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function checkHealth() {
  try {
    const res = await fetch("http://127.0.0.1:28889/health");
    return res.ok;
  } catch {
    return false;
  }
}

async function main() {
  if (!fs.existsSync(executablePath) || !fs.existsSync(entryScript)) {
    throw new Error(`Portable artifact is missing for mode=${mode}. Run 'corepack pnpm build:portable${mode === "full" ? ":full" : ""}' first.`);
  }

  fs.rmSync(stdoutPath, { force: true });
  fs.rmSync(stderrPath, { force: true });
  fs.rmSync(stateDir, { recursive: true, force: true });

  const stdout = fs.openSync(stdoutPath, "w");
  const stderr = fs.openSync(stderrPath, "w");

  const child = spawn(executablePath, [entryScript], {
    cwd: portableRoot,
    env: {
      ...process.env,
      BELLDANDY_STATE_DIR: stateDir,
      AUTO_OPEN_BROWSER: "false",
    },
    stdio: ["ignore", stdout, stderr],
    windowsHide: true,
  });

  let healthy = false;
  try {
    for (let i = 0; i < 20; i++) {
      await wait(1000);
      if (child.exitCode != null) break;
      if (await checkHealth()) {
        healthy = true;
        break;
      }
    }
  } finally {
    if (child.exitCode == null) {
      child.kill("SIGTERM");
      await wait(1000);
      if (child.exitCode == null) {
        child.kill("SIGKILL");
      }
    }
    fs.closeSync(stdout);
    fs.closeSync(stderr);
  }

  if (!healthy) {
    const stdoutTail = fs.existsSync(stdoutPath) ? fs.readFileSync(stdoutPath, "utf-8") : "";
    const stderrTail = fs.existsSync(stderrPath) ? fs.readFileSync(stderrPath, "utf-8") : "";
    throw new Error(`Portable smoke test failed.\n--- stdout ---\n${stdoutTail}\n--- stderr ---\n${stderrTail}`);
  }

  console.log(`[portable-smoke] Portable package (${mode}) started successfully and /health responded.`);
}

main();
