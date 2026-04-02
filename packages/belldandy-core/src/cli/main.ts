/**
 * Belldandy CLI — root command definition.
 * Sub-commands are lazily loaded via dynamic import.
 */
import { defineCommand } from "citty";
import { BELLDANDY_VERSION } from "../version.generated.js";
import { getRootCLICommands } from "./builtin-command-registry.js";

export const main = defineCommand({
  meta: {
    name: "belldandy",
    version: BELLDANDY_VERSION,
    description: "Belldandy AI Assistant CLI",
  },
  args: {
    json: { type: "boolean", description: "JSON output (machine-readable)" },
    "state-dir": { type: "string", description: "Override state directory" },
    verbose: { type: "boolean", description: "Verbose output" },
  },
  subCommands: getRootCLICommands(),
});
