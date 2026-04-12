import { defineCommand } from "citty";

import { createCLIContext } from "../../shared/context.js";
import { resolveEnvLocalPath } from "../../shared/env-loader.js";
import { runAdvancedModulesWizard } from "../../wizard/advanced-modules.js";
import { printConfigureCompletion } from "./shared.js";

export default defineCommand({
  meta: { name: "webhook", description: "Configure webhook API rules" },
  args: {
    "state-dir": { type: "string", description: "Override state directory" },
  },
  async run({ args }) {
    const ctx = createCLIContext({ stateDir: args["state-dir"] });
    const result = await runAdvancedModulesWizard({
      envPath: resolveEnvLocalPath(ctx.envDir),
      stateDir: ctx.stateDir,
      authMode: "none",
      modules: ["webhook"],
    });
    printConfigureCompletion(ctx, "webhook", "Webhook", result);
  },
});
