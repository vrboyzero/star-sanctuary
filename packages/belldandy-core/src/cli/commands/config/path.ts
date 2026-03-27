import { defineCommand } from "citty";
import { createCLIContext } from "../../shared/context.js";
import { resolveEnvLocalPath } from "../../shared/env-loader.js";

export default defineCommand({
  meta: { name: "path", description: "Show configuration file path" },
  args: {
    json: { type: "boolean", description: "JSON output" },
    "state-dir": { type: "string", description: "Override state directory" },
  },
  async run({ args }) {
    const ctx = createCLIContext({ json: args.json, stateDir: args["state-dir"] });
    const envPath = resolveEnvLocalPath(ctx.envDir);

    if (ctx.json) {
      ctx.output({ path: envPath });
    } else {
      ctx.log(envPath);
    }
  },
});
