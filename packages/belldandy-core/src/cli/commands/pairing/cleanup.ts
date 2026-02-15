import { defineCommand } from "citty";
import { cleanupPending } from "../../../security/store.js";
import { createCLIContext } from "../../shared/context.js";

export default defineCommand({
  meta: { name: "cleanup", description: "Remove expired pairing requests" },
  args: {
    "dry-run": { type: "boolean", description: "Preview without removing" },
    json: { type: "boolean", description: "JSON output" },
    "state-dir": { type: "string", description: "Override state directory" },
  },
  async run({ args }) {
    const ctx = createCLIContext({ json: args.json, stateDir: args["state-dir"] });
    const result = await cleanupPending({ stateDir: ctx.stateDir, dryRun: args["dry-run"] });

    if (ctx.json) {
      ctx.output({
        dryRun: args["dry-run"] ?? false,
        cleaned: result.cleaned.length,
        remaining: result.remaining,
        items: result.cleaned.map((p) => ({
          code: p.code,
          clientId: p.clientId,
          createdAt: p.createdAt,
        })),
      });
      return;
    }

    if (result.cleaned.length === 0) {
      ctx.log("No expired requests found.");
    } else {
      const prefix = args["dry-run"] ? "[DRY RUN] Would clean" : "Cleaned";
      ctx.log(`${prefix} ${result.cleaned.length} expired requests:`);
      for (const p of result.cleaned) {
        ctx.log(`  - [${p.code}] ${p.clientId} (created: ${p.createdAt})`);
      }
    }
    ctx.log(`Remaining pending requests: ${result.remaining}`);
  },
});
