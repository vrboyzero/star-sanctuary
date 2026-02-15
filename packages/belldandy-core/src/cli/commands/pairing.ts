/**
 * bdd pairing — parent command for pairing management.
 */
import { defineCommand } from "citty";

export default defineCommand({
  meta: { name: "pairing", description: "Manage client pairing" },
  subCommands: {
    approve: () => import("./pairing/approve.js").then((m) => m.default),
    revoke: () => import("./pairing/revoke.js").then((m) => m.default),
    list: () => import("./pairing/list.js").then((m) => m.default),
    pending: () => import("./pairing/pending.js").then((m) => m.default),
    cleanup: () => import("./pairing/cleanup.js").then((m) => m.default),
    export: () => import("./pairing/export.js").then((m) => m.default),
    import: () => import("./pairing/import.js").then((m) => m.default),
  },
});
