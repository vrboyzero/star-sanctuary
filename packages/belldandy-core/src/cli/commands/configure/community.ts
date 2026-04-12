import { defineCommand } from "citty";

import { createCLIContext } from "../../shared/context.js";
import { resolveEnvLocalPath } from "../../shared/env-loader.js";
import { runAdvancedModulesWizard } from "../../wizard/advanced-modules.js";
import { printConfigureCompletion } from "./shared.js";

export default defineCommand({
  meta: { name: "community", description: "Configure community integration" },
  args: {
    "state-dir": { type: "string", description: "Override state directory" },
  },
  async run({ args }) {
    const ctx = createCLIContext({ stateDir: args["state-dir"] });
    const result = await runAdvancedModulesWizard({
      envPath: resolveEnvLocalPath(ctx.envDir),
      stateDir: ctx.stateDir,
      authMode: String(process.env.BELLDANDY_AUTH_MODE ?? "none").toLowerCase() === "token"
        ? "token"
        : String(process.env.BELLDANDY_AUTH_MODE ?? "none").toLowerCase() === "password"
          ? "password"
          : "none",
      modules: ["community"],
    });
    printConfigureCompletion(ctx, "community", "Community", result);
  },
});
