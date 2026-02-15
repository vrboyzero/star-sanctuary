/**
 * Belldandy CLI — root command definition.
 * Sub-commands are lazily loaded via dynamic import.
 */
import { defineCommand } from "citty";

export const main = defineCommand({
  meta: {
    name: "belldandy",
    version: "0.1.0",
    description: "Belldandy AI Assistant CLI",
  },
  args: {
    json: { type: "boolean", description: "JSON output (machine-readable)" },
    "state-dir": { type: "string", description: "Override state directory" },
    verbose: { type: "boolean", description: "Verbose output" },
  },
  subCommands: {
    start: () => import("./commands/start.js").then((m) => m.default),
    dev: () => import("./commands/dev.js").then((m) => m.default),
    doctor: () => import("./commands/doctor.js").then((m) => m.default),
    setup: () => import("./commands/setup.js").then((m) => m.default),
    pairing: () => import("./commands/pairing.js").then((m) => m.default),
    config: () => import("./commands/config.js").then((m) => m.default),
    relay: () => import("./commands/relay.js").then((m) => m.default),
  },
});
