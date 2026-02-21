/**
 * bdd start — Launch Gateway with process supervisor (auto-restart on exit code 100).
 * Delegates to the existing launcher.ts via fork.
 */
import { defineCommand } from "citty";
import { fork } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// 根据当前文件扩展名判断是开发模式(.ts)还是生产模式(.js)
const ext = path.extname(__filename);
const GATEWAY_SCRIPT = path.resolve(__dirname, `../../bin/gateway${ext}`);

const RESTART_EXIT_CODE = 100;
const RESTART_DELAY_MS = 500;

export default defineCommand({
  meta: { name: "start", description: "Start Gateway with supervisor (auto-restart)" },
  async run() {
    function launchGateway(): void {
      console.log(`[Launcher] Starting Gateway...`);

      const child = fork(GATEWAY_SCRIPT, [], {
        stdio: "inherit",
        // 生产模式(.js)不需要 tsx loader
        execArgv: ext === ".ts" ? ["--import", "tsx"] : [],
      });

      child.on("exit", (code, signal) => {
        if (code === RESTART_EXIT_CODE) {
          console.log(`[Launcher] Gateway requested restart, restarting in ${RESTART_DELAY_MS}ms...`);
          setTimeout(() => launchGateway(), RESTART_DELAY_MS);
        } else {
          const reason = signal ? `signal ${signal}` : `exit code ${code ?? 1}`;
          console.log(`[Launcher] Gateway exited (${reason}).`);
          process.exit(code ?? 1);
        }
      });

      const forwardSignal = (sig: NodeJS.Signals) => {
        child.kill(sig);
      };
      process.on("SIGINT", forwardSignal);
      process.on("SIGTERM", forwardSignal);
    }

    launchGateway();
  },
});
