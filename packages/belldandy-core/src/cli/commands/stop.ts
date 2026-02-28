/**
 * bdd stop — Stop the Gateway daemon process.
 */
import { defineCommand } from "citty";
import { stopDaemon, getDaemonStatus } from "../daemon.js";
import { createCLIContext } from "../shared/context.js";

export default defineCommand({
  meta: { name: "stop", description: "Stop the Gateway daemon" },
  args: {
    json: { type: "boolean", description: "JSON output" },
    "state-dir": { type: "string", description: "Override state directory" },
    timeout: {
      type: "string",
      description: "Timeout in seconds (default: 10)",
      default: "10",
    },
  },
  async run({ args }) {
    const ctx = createCLIContext({ json: args.json, stateDir: args["state-dir"] });
    const timeout = parseInt(args.timeout, 10) * 1000;

    const status = getDaemonStatus(ctx.stateDir);
    if (!status.running) {
      if (ctx.json) {
        ctx.output({ success: false, error: "Gateway is not running" });
      } else {
        ctx.warn("Gateway is not running");
      }
      process.exit(1);
    }

    if (!ctx.json) {
      ctx.log(`Stopping Gateway (PID ${status.pid})...`);
    }

    const result = await stopDaemon(ctx.stateDir, timeout);

    if (result.success) {
      if (ctx.json) {
        ctx.output({ success: true, pid: status.pid });
      } else {
        ctx.success("Gateway stopped");
      }
    } else {
      if (ctx.json) {
        ctx.output({ success: false, error: result.error, pid: status.pid });
      } else {
        ctx.error(result.error ?? "Failed to stop gateway");
      }
      process.exit(1);
    }
  },
});
