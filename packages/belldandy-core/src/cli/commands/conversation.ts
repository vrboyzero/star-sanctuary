import { defineCommand } from "citty";

export default defineCommand({
  meta: { name: "conversation", description: "Inspect persisted conversation transcript and timeline" },
  subCommands: {
    list: () => import("./conversation/list.js").then((m) => m.default),
    export: () => import("./conversation/export.js").then((m) => m.default),
    timeline: () => import("./conversation/timeline.js").then((m) => m.default),
    exports: () => import("./conversation/exports.js").then((m) => m.default),
  },
});
