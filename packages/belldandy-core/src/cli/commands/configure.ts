import { defineCommand } from "citty";

export default defineCommand({
  meta: { name: "configure", description: "Configure advanced setup modules" },
  subCommands: {
    bridge: () => import("./configure/bridge.js").then((m) => m.default),
    community: () => import("./configure/community.js").then((m) => m.default),
    models: () => import("./configure/models.js").then((m) => m.default),
    webhook: () => import("./configure/webhook.js").then((m) => m.default),
    cron: () => import("./configure/cron.js").then((m) => m.default),
  },
});
