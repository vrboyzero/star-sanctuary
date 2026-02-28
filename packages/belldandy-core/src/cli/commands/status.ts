/**
 * bdd status — Show Gateway daemon status.
 */
import { defineCommand } from "citty";
import pc from "picocolors";
import { getDaemonStatus, formatUptime } from "../daemon.js";
import { createCLIContext } from "../shared/context.js";

export default defineCommand({
  meta: { name: "status", description: "Show Gateway daemon status" },
  args: {
    json: { type: "boolean", description: "JSON output" },
    "state-dir": { type: "string", description: "Override state directory" },
  },
  async run({ args }) {
    const ctx = createCLIContext({ json: args.json, stateDir: args["state-dir"] });
    const status = getDaemonStatus(ctx.stateDir);

    if (ctx.json) {
      ctx.output({
        running: status.running,
        pid: status.pid,
        uptime: status.uptime,
        logFile: status.logFile,
        pidFile: status.pidFile,
      });
      return;
    }

    ctx.log("Belldandy Gateway Status\n");

    if (status.running && status.pid) {
      ctx.log(pc.green(`  ● Running`));
      ctx.log(`    PID:     ${status.pid}`);
      if (status.uptime !== null) {
        ctx.log(`    Uptime:  ${formatUptime(status.uptime)}`);
      }
    } else {
      ctx.log(pc.gray(`  ○ Stopped`));
      if (status.pid) {
        ctx.log(pc.yellow(`    (stale PID file: ${status.pid})`));
      }
    }

    ctx.log(`    Log:     ${status.logFile}`);
    ctx.log(`    PID file: ${status.pidFile}`);
    ctx.log("");

    if (!status.running) {
      ctx.log(`  Start with: ${pc.cyan("bdd start -d")}`);
    } else {
      ctx.log(`  Stop with:  ${pc.cyan("bdd stop")}`);
    }
  },
});
