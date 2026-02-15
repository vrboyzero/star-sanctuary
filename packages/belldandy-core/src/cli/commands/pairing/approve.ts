import { defineCommand } from "citty";
import { approvePairingCode } from "../../../security/store.js";
import { createCLIContext } from "../../shared/context.js";

export default defineCommand({
  meta: { name: "approve", description: "Approve a pending pairing code" },
  args: {
    code: { type: "positional", description: "Pairing code to approve", required: true },
    json: { type: "boolean", description: "JSON output" },
    "state-dir": { type: "string", description: "Override state directory" },
  },
  async run({ args }) {
    const ctx = createCLIContext({ json: args.json, stateDir: args["state-dir"] });
    const result = await approvePairingCode({ code: args.code, stateDir: ctx.stateDir });
    if (result.ok) {
      ctx.output({ status: "approved", clientId: result.clientId });
      ctx.success(`Client ${result.clientId} approved`);
    } else {
      ctx.error(result.message);
      process.exit(1);
    }
  },
});
