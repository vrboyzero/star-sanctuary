import fs from "node:fs";
import { spawn } from "node:child_process";

export const RESTART_EXIT_CODE = 100;
export const RESTART_DELAY_MS = 500;

export type GatewaySupervisorParams = {
  label: string;
  gatewayEntry: string;
  runtimeExecutable?: string;
  cwd: string;
  env: NodeJS.ProcessEnv;
};

export function startGatewaySupervisor(params: GatewaySupervisorParams): void {
  const { label, gatewayEntry, runtimeExecutable, cwd, env } = params;

  const launch = () => {
    console.log(`[${label}] Starting Gateway...`);
    fs.mkdirSync(cwd, { recursive: true });

    const child = spawn(runtimeExecutable ?? process.execPath, [gatewayEntry], {
      stdio: "inherit",
      cwd,
      env,
    });

    child.on("exit", (code, signal) => {
      if (code === RESTART_EXIT_CODE) {
        console.log(`[${label}] Gateway requested restart, restarting in ${RESTART_DELAY_MS}ms...`);
        setTimeout(launch, RESTART_DELAY_MS);
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

  launch();
}
