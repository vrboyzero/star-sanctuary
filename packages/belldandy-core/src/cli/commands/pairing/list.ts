import { defineCommand } from "citty";
import { readAllowlistStore } from "../../../security/store.js";
import { createCLIContext } from "../../shared/context.js";

export default defineCommand({
  meta: { name: "list", description: "List approved clients" },
  args: {
    json: { type: "boolean", description: "JSON output" },
    "state-dir": { type: "string", description: "Override state directory" },
  },
  async run({ args }) {
    const ctx = createCLIContext({ json: args.json, stateDir: args["state-dir"] });
    const store = await readAllowlistStore(ctx.stateDir);

    if (ctx.json) {
      ctx.output({ allowlist: store.allowFrom, count: store.allowFrom.length });
      return;
    }

    if (store.allowFrom.length === 0) {
      ctx.log("Allowlist is empty.");
      return;
    }

    ctx.log(`Allowlist (${store.allowFrom.length}):`);
    for (const clientId of store.allowFrom) {
      ctx.log(`  - ${clientId}`);
    }
  },
});
