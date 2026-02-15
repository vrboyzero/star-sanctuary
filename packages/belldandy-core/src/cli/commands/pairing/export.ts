import { defineCommand } from "citty";
import { readAllowlistStore, readPairingStore } from "../../../security/store.js";
import { createCLIContext } from "../../shared/context.js";
import fs from "node:fs/promises";
import path from "node:path";

export default defineCommand({
  meta: { name: "export", description: "Export pairing data to file or stdout" },
  args: {
    out: { type: "string", description: "Output file path" },
    json: { type: "boolean", description: "Output JSON to stdout" },
    "include-pending": { type: "boolean", description: "Include pending requests" },
    "state-dir": { type: "string", description: "Override state directory" },
  },
  async run({ args }) {
    const ctx = createCLIContext({ json: args.json, stateDir: args["state-dir"] });

    if (!args.out && !args.json) {
      ctx.error("Specify --out <file> or --json");
      process.exit(1);
    }

    const allowlist = await readAllowlistStore(ctx.stateDir);
    const exportData: Record<string, unknown> = {
      allowlist: allowlist.allowFrom,
      exportedAt: new Date().toISOString(),
    };

    if (args["include-pending"]) {
      const pairing = await readPairingStore(ctx.stateDir);
      exportData.pending = pairing.pending;
    }

    if (args.json) {
      console.log(JSON.stringify(exportData, null, 2));
    } else if (args.out) {
      const absPath = path.resolve(process.cwd(), args.out);
      await fs.writeFile(absPath, JSON.stringify(exportData, null, 2), "utf-8");
      ctx.success(`Exported to ${absPath}`);
    }
  },
});
