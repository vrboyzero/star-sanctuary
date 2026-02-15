import { defineCommand } from "citty";
import {
  readAllowlistStore,
  writeAllowlistStore,
  readPairingStore,
  writePairingStore,
} from "../../../security/store.js";
import { createCLIContext } from "../../shared/context.js";
import fs from "node:fs/promises";
import path from "node:path";

export default defineCommand({
  meta: { name: "import", description: "Import pairing data from file" },
  args: {
    in: { type: "string", description: "Input file path", required: true },
    mode: { type: "string", description: "Import mode: merge (default) or replace" },
    json: { type: "boolean", description: "JSON output" },
    "state-dir": { type: "string", description: "Override state directory" },
  },
  async run({ args }) {
    const ctx = createCLIContext({ json: args.json, stateDir: args["state-dir"] });
    const mode = args.mode ?? "merge";

    if (mode !== "merge" && mode !== "replace") {
      ctx.error("Invalid mode. Use 'merge' or 'replace'.");
      process.exit(1);
    }

    const absPath = path.resolve(process.cwd(), args.in);
    let data: { allowlist?: string[]; pending?: Array<{ clientId: string; code: string; createdAt: string }> };
    try {
      const raw = await fs.readFile(absPath, "utf-8");
      data = JSON.parse(raw);
    } catch (err: any) {
      ctx.error(`Failed to read import file: ${err.message}`);
      process.exit(1);
    }

    if (!Array.isArray(data!.allowlist)) {
      ctx.error("Invalid import file format: missing 'allowlist' array.");
      process.exit(1);
    }

    // Import Allowlist
    const currentAllow = await readAllowlistStore(ctx.stateDir);
    if (mode === "replace") {
      currentAllow.allowFrom = data!.allowlist;
    } else {
      const set = new Set(currentAllow.allowFrom);
      for (const id of data!.allowlist) set.add(id);
      currentAllow.allowFrom = Array.from(set);
    }
    await writeAllowlistStore(ctx.stateDir, currentAllow);

    const result: Record<string, unknown> = {
      mode,
      allowlistCount: currentAllow.allowFrom.length,
    };

    // Import Pending (optional)
    if (Array.isArray(data!.pending)) {
      const currentPending = await readPairingStore(ctx.stateDir);
      if (mode === "replace") {
        currentPending.pending = data!.pending;
      } else {
        const codeMap = new Map(currentPending.pending.map((p) => [p.code, p]));
        for (const p of data!.pending) {
          if (!codeMap.has(p.code)) codeMap.set(p.code, p);
        }
        currentPending.pending = Array.from(codeMap.values());
      }
      await writePairingStore(ctx.stateDir, currentPending);
      result.pendingCount = currentPending.pending.length;
    }

    if (ctx.json) {
      ctx.output(result);
    } else {
      ctx.success(`Imported allowlist (mode=${mode}). Total allowed: ${result.allowlistCount}`);
      if (result.pendingCount !== undefined) {
        ctx.success(`Imported pending requests (mode=${mode}). Total pending: ${result.pendingCount}`);
      }
    }
  },
});
