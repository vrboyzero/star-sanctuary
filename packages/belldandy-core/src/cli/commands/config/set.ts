import { defineCommand } from "citty";
import { createCLIContext } from "../../shared/context.js";
import { updateEnvValue, resolveEnvLocalPath } from "../../shared/env-loader.js";

export default defineCommand({
  meta: { name: "set", description: "Set a configuration value" },
  args: {
    key: { type: "positional", description: "Configuration key", required: true },
    value: { type: "positional", description: "Configuration value", required: true },
    json: { type: "boolean", description: "JSON output" },
    "state-dir": { type: "string", description: "Override state directory" },
  },
  async run({ args }) {
    const ctx = createCLIContext({ json: args.json, stateDir: args["state-dir"] });
    const envPath = resolveEnvLocalPath();

    try {
      updateEnvValue(envPath, args.key, args.value);
      if (ctx.json) {
        ctx.output({ key: args.key, value: args.value, path: envPath });
      } else {
        ctx.success(`${args.key}=${args.value} written to ${envPath}`);
      }
    } catch (err) {
      ctx.error(`Failed to write: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  },
});
