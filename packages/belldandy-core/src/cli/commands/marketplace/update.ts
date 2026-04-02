import { defineCommand } from "citty";

import { updateMarketplaceExtension } from "../../../extension-marketplace-service.js";
import { createCLIContext } from "../../shared/context.js";
import { failCli } from "./shared.js";

export default defineCommand({
  meta: { name: "update", description: "Refresh an installed extension from its known marketplace source" },
  args: {
    id: { type: "positional", description: "Installed extension id (<name>@<marketplace>)", required: true },
    json: { type: "boolean", description: "JSON output" },
    "state-dir": { type: "string", description: "Override state directory" },
  },
  async run({ args }) {
    const ctx = createCLIContext({ json: args.json, stateDir: args["state-dir"] });

    try {
      const result = await updateMarketplaceExtension({
        stateDir: ctx.stateDir,
        extensionId: args.id,
      });

      if (ctx.json) {
        ctx.output({
          status: "updated",
          extension: result.installed,
          source: result.preparedSource,
          materialized: result.materialized,
        });
        return;
      }

      ctx.success(`Updated ${result.installed.id}`);
      ctx.log(`  version: ${result.installed.version ?? "unknown"}`);
      ctx.log(`  materialized: ${result.materialized.materializedPath}`);
    } catch (error) {
      failCli(ctx, error instanceof Error ? error.message : String(error));
    }
  },
});

