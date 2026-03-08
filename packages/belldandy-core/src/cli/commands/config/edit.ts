import { defineCommand } from "citty";
import { execSync } from "node:child_process";
import fs from "node:fs";
import { createCLIContext } from "../../shared/context.js";
import { resolveEnvLocalPath } from "../../shared/env-loader.js";

export default defineCommand({
  meta: { name: "edit", description: "Open .env.local in your editor" },
  args: {
    json: { type: "boolean", description: "JSON output" },
    "state-dir": { type: "string", description: "Override state directory" },
  },
  async run({ args }) {
    const ctx = createCLIContext({ json: args.json, stateDir: args["state-dir"] });
    const envPath = resolveEnvLocalPath();

    // Ensure file exists
    if (!fs.existsSync(envPath)) {
      fs.writeFileSync(envPath, "# Star Sanctuary local configuration\n", "utf-8");
    }

    const editor =
      process.env.EDITOR ||
      process.env.VISUAL ||
      (process.platform === "win32" ? "notepad" : "vi");

    if (ctx.json) {
      ctx.output({ editor, path: envPath });
      return;
    }

    ctx.log(`Opening ${envPath} with ${editor}...`);
    try {
      execSync(`${editor} "${envPath}"`, { stdio: "inherit" });
    } catch {
      ctx.error(`Failed to open editor '${editor}'. Set $EDITOR to override.`);
      process.exit(1);
    }
  },
});

