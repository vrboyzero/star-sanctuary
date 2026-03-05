/**
 * Belldandy CLI — root command definition.
 * Sub-commands are lazily loaded via dynamic import.
 */
import { defineCommand } from "citty";
import { BELLDANDY_VERSION } from "../version.generated.js";

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
  subCommands: {
    start: () => import("./commands/start.js").then((m) => m.default),
    stop: () => import("./commands/stop.js").then((m) => m.default),
    status: () => import("./commands/status.js").then((m) => m.default),
    dev: () => import("./commands/dev.js").then((m) => m.default),
    doctor: () => import("./commands/doctor.js").then((m) => m.default),
    setup: () => import("./commands/setup.js").then((m) => m.default),
    pairing: () => import("./commands/pairing.js").then((m) => m.default),
    config: () => import("./commands/config.js").then((m) => m.default),
    relay: () => import("./commands/relay.js").then((m) => m.default),
    community: () => import("./commands/community.js").then((m) => m.default),
  },
});
