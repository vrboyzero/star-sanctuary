import { defineCommand } from "citty";
import { createCLIContext } from "../../shared/context.js";
import { parseEnvFile, resolveEnvLocalPath } from "../../shared/env-loader.js";

export default defineCommand({
  meta: { name: "get", description: "Get a configuration value" },
  args: {
    key: { type: "positional", description: "Configuration key", required: true },
    json: { type: "boolean", description: "JSON output" },
    "state-dir": { type: "string", description: "Override state directory" },
  },
  async run({ args }) {
    const ctx = createCLIContext({ json: args.json, stateDir: args["state-dir"] });
    const entries = parseEnvFile(resolveEnvLocalPath());
    const entry = entries.find((e) => e.key === args.key);

    if (!entry) {
      if (ctx.json) {
        ctx.output({ key: args.key, value: null });
      } else {
        ctx.error(`Key '${args.key}' not found in .env.local`);
      }
      process.exit(1);
    }

    if (ctx.json) {
      ctx.output({ key: entry.key, value: entry.value });
    } else {
      ctx.log(entry.value);
    }
  },
});
