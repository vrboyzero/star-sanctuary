/**
 * bdd config — parent command for configuration management.
 */
import { defineCommand } from "citty";

export default defineCommand({
  meta: { name: "config", description: "Manage configuration (.env.local)" },
  subCommands: {
    list: () => import("./config/list.js").then((m) => m.default),
    get: () => import("./config/get.js").then((m) => m.default),
    set: () => import("./config/set.js").then((m) => m.default),
    edit: () => import("./config/edit.js").then((m) => m.default),
    path: () => import("./config/path.js").then((m) => m.default),
    "migrate-to-state-dir": () => import("./config/migrate-to-state-dir.js").then((m) => m.default),
  },
});
