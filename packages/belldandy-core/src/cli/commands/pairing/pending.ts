import { defineCommand } from "citty";
import { readPairingStore } from "../../../security/store.js";
import { createCLIContext } from "../../shared/context.js";

export default defineCommand({
  meta: { name: "pending", description: "List pending pairing requests" },
  args: {
    json: { type: "boolean", description: "JSON output" },
    "state-dir": { type: "string", description: "Override state directory" },
  },
  async run({ args }) {
    const ctx = createCLIContext({ json: args.json, stateDir: args["state-dir"] });
    const store = await readPairingStore(ctx.stateDir);

    // Sort by creation time (desc)
    store.pending.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

    if (ctx.json) {
      ctx.output({ pending: store.pending, count: store.pending.length });
      return;
    }

    if (store.pending.length === 0) {
      ctx.log("No pending pairing requests.");
      return;
    }

    ctx.log(`Pending Requests (${store.pending.length}):`);
    ctx.log(`${"CODE".padEnd(10)} ${"CLIENT ID".padEnd(30)} CREATED AT`);
    ctx.log("-".repeat(70));
    for (const p of store.pending) {
      ctx.log(`${p.code.padEnd(10)} ${p.clientId.padEnd(30)} ${p.createdAt}`);
    }
  },
});
