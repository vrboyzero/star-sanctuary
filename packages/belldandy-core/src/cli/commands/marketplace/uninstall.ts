import { defineCommand } from "citty";

import { uninstallMarketplaceExtension } from "../../../extension-marketplace-service.js";
import { createCLIContext } from "../../shared/context.js";
import { failCli } from "./shared.js";

export default defineCommand({
  meta: { name: "uninstall", description: "Uninstall an installed marketplace extension" },
  args: {
    id: { type: "positional", description: "Installed extension id (<name>@<marketplace>)", required: true },
    json: { type: "boolean", description: "JSON output" },
    "state-dir": { type: "string", description: "Override state directory" },
  },
  async run({ args }) {
    const ctx = createCLIContext({ json: args.json, stateDir: args["state-dir"] });

    try {
      const result = await uninstallMarketplaceExtension({
        stateDir: ctx.stateDir,
        extensionId: args.id,
      });

      if (ctx.json) {
        ctx.output({ status: "uninstalled", extension: result.removed });
        return;
      }

      ctx.success(`Uninstalled ${result.removed.id}`);
    } catch (error) {
      failCli(ctx, error instanceof Error ? error.message : String(error));
    }
  },
});

