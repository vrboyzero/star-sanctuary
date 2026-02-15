import { defineCommand } from "citty";
import { createCLIContext } from "../../shared/context.js";
import { parseEnvFile, resolveEnvLocalPath } from "../../shared/env-loader.js";

const SENSITIVE_PATTERNS = [/KEY/i, /SECRET/i, /TOKEN/i, /PASSWORD/i];

function redact(key: string, value: string): string {
  if (SENSITIVE_PATTERNS.some((p) => p.test(key))) {
    return value.length > 4 ? value.slice(0, 2) + "***" + value.slice(-2) : "***";
  }
  return value;
}

export default defineCommand({
  meta: { name: "list", description: "List all configuration values" },
  args: {
    json: { type: "boolean", description: "JSON output" },
    "state-dir": { type: "string", description: "Override state directory" },
    "show-secrets": { type: "boolean", description: "Show sensitive values unmasked" },
  },
  async run({ args }) {
    const ctx = createCLIContext({ json: args.json, stateDir: args["state-dir"] });
    const envPath = resolveEnvLocalPath();
    const entries = parseEnvFile(envPath);

    if (entries.length === 0) {
      if (ctx.json) {
        ctx.output({ config: {}, path: envPath });
      } else {
        ctx.warn(`No configuration found. Run 'bdd setup' or create ${envPath}`);
      }
      return;
    }

    const showSecrets = args["show-secrets"] ?? false;

    if (ctx.json) {
      const obj: Record<string, string> = {};
      for (const { key, value } of entries) {
        obj[key] = showSecrets ? value : redact(key, value);
      }
      ctx.output({ config: obj, path: envPath });
      return;
    }

    ctx.log(`Configuration (${envPath}):\n`);
    for (const { key, value } of entries) {
      const display = showSecrets ? value : redact(key, value);
      ctx.log(`  ${key}=${display}`);
    }
  },
});
