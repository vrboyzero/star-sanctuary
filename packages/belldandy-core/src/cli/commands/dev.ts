/**
 * bdd dev — Start Gateway directly (development mode, no supervisor).
 * Imports and runs gateway.ts inline.
 */
import { defineCommand } from "citty";

export default defineCommand({
  meta: { name: "dev", description: "Start Gateway in development mode (no supervisor)" },
  async run() {
    // Directly import gateway.ts — it self-starts on import
    await import("../../bin/gateway.js");
  },
});
