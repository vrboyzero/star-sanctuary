import fs from "node:fs";
import { spawn } from "node:child_process";
import {
  preflightGatewayCleanup,
  removeForegroundPid,
  writeForegroundPid,
} from "./gateway-preflight.js";

export const RESTART_EXIT_CODE = 100;
export const RESTART_DELAY_MS = 500;

export type GatewaySupervisorParams = {
  label: string;
  gatewayEntry: string;
  runtimeExecutable?: string;
  cwd: string;
  stateDir: string;
  env: NodeJS.ProcessEnv;
};

export async function startGatewaySupervisor(params: GatewaySupervisorParams): Promise<void> {
  const { label, gatewayEntry, runtimeExecutable, cwd, stateDir, env } = params;

  const launch = async () => {
    await preflightGatewayCleanup({
      label,
      stateDir,
      env,
      ownershipTokens: [gatewayEntry],
    });
    console.log(`[${label}] Starting Gateway...`);
    fs.mkdirSync(cwd, { recursive: true });

    const child = spawn(runtimeExecutable ?? process.execPath, [gatewayEntry], {
      stdio: "inherit",
      cwd,
      env,
    });
    if (child.pid) {
      writeForegroundPid(stateDir, child.pid);
    }

    child.on("exit", (code, signal) => {
      removeForegroundPid(stateDir);
      if (code === RESTART_EXIT_CODE) {
        console.log(`[${label}] Gateway requested restart, restarting in ${RESTART_DELAY_MS}ms...`);
        setTimeout(() => {
          void launch().catch((error) => {
            console.error(`[${label}] Failed to restart gateway: ${error instanceof Error ? error.message : String(error)}`);
            process.exit(1);
          });
        }, RESTART_DELAY_MS);
        return;
      }

      const reason = signal ? `signal ${signal}` : `exit code ${code ?? 1}`;
      console.log(`[${label}] Gateway exited (${reason}).`);
      process.exit(code ?? 1);
    });

    const forwardSignal = (sig: NodeJS.Signals) => {
      if (!child.killed) child.kill(sig);
    };

    process.on("SIGINT", forwardSignal);
    process.on("SIGTERM", forwardSignal);
  };

  await launch();
}
