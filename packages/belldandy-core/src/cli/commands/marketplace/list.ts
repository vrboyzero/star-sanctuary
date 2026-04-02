import { defineCommand } from "citty";

import { loadExtensionMarketplaceState } from "../../../extension-marketplace-state.js";
import { createCLIContext } from "../../shared/context.js";

export default defineCommand({
  meta: { name: "list", description: "List marketplace state and installed extensions" },
  args: {
    json: { type: "boolean", description: "JSON output" },
    "state-dir": { type: "string", description: "Override state directory" },
  },
  async run({ args }) {
    const ctx = createCLIContext({ json: args.json, stateDir: args["state-dir"] });
    const snapshot = await loadExtensionMarketplaceState(ctx.stateDir);

    if (ctx.json) {
      ctx.output(snapshot);
      return;
    }

    ctx.log(`Known marketplaces: ${snapshot.summary.knownMarketplaceCount}`);
    for (const marketplace of Object.values(snapshot.knownMarketplaces.marketplaces)) {
      ctx.log(`  - ${marketplace.name} [${marketplace.source.source}]${marketplace.autoUpdate ? " auto-update" : ""}`);
    }

    ctx.log("");
    ctx.log(`Installed extensions: ${snapshot.summary.installedExtensionCount}`);
    for (const extension of Object.values(snapshot.installedExtensions.extensions).sort((a, b) => a.id.localeCompare(b.id))) {
      ctx.log(
        `  - ${extension.id} ${extension.version ? `v${extension.version}` : ""} [${extension.status}]${extension.enabled ? "" : " disabled"}`,
      );
    }
  },
});

