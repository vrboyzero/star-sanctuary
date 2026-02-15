import { defineCommand } from "citty";
import { revokeClient } from "../../../security/store.js";
import { createCLIContext } from "../../shared/context.js";

export default defineCommand({
  meta: { name: "revoke", description: "Revoke an approved client" },
  args: {
    clientId: { type: "positional", description: "Client ID to revoke", required: true },
    json: { type: "boolean", description: "JSON output" },
    "state-dir": { type: "string", description: "Override state directory" },
  },
  async run({ args }) {
    const ctx = createCLIContext({ json: args.json, stateDir: args["state-dir"] });
    const result = await revokeClient({ clientId: args.clientId, stateDir: ctx.stateDir });
    if (ctx.json) {
      ctx.output({ status: result.removed ? "revoked" : "not_found", clientId: args.clientId });
    } else {
      if (result.removed) {
        ctx.success(`Revoked: ${args.clientId}`);
      } else {
        ctx.warn(`Not found: ${args.clientId}`);
      }
    }
  },
});
