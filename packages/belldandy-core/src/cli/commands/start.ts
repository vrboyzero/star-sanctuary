/**
 * bdd start — Launch Gateway with process supervisor.
 * Supports foreground mode (default) and daemon mode (-d/--daemon).
 */
import { defineCommand } from "citty";
import pc from "picocolors";
import { startDaemon, startForeground, getDaemonStatus } from "../daemon.js";
import { createCLIContext } from "../shared/context.js";

export default defineCommand({
  meta: { name: "start", description: "Start Gateway (foreground or daemon mode)" },
  args: {
    daemon: {
      type: "boolean",
      alias: "d",
      description: "Run in background (daemon mode)",
      default: false,
    },
    json: { type: "boolean", description: "JSON output" },
    "state-dir": { type: "string", description: "Override state directory" },
  },
  async run({ args }) {
    const ctx = createCLIContext({ json: args.json, stateDir: args["state-dir"] });

    if (args.daemon) {
      // Daemon mode - start in background
      const status = getDaemonStatus(ctx.stateDir);
      if (status.running) {
        if (ctx.json) {
          ctx.output({ success: false, error: `Gateway is already running (PID ${status.pid})`, pid: status.pid });
        } else {
          ctx.error(`Gateway is already running (PID ${status.pid})`);
        }
        process.exit(1);
      }

      const result = await startDaemon(ctx.stateDir);
      if (result.success) {
        if (ctx.json) {
          ctx.output({ success: true, pid: result.pid, logFile: status.logFile });
        } else {
          ctx.success(`Gateway started in background (PID ${result.pid})`);
          ctx.log(`  Log file: ${status.logFile}`);
          ctx.log(`  Stop with: ${pc.cyan("bdd stop")}`);
        }
      } else {
        if (ctx.json) {
          ctx.output({ success: false, error: result.error });
        } else {
          ctx.error(result.error ?? "Failed to start gateway");
        }
        process.exit(1);
      }
    } else {
      // Foreground mode - existing behavior with auto-restart
      startForeground();
    }
  },
});
