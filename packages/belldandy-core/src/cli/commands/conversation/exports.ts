import { defineCommand } from "citty";
import { createCLIContext } from "../../shared/context.js";
import { normalizeConversationIdPrefix, parsePositiveInteger } from "../../../conversation-debug-projection.js";
import { listConversationCLIRecentExports, renderRecentConversationExports } from "./_shared.js";

export default defineCommand({
  meta: { name: "exports", description: "List recent transcript/timeline exports written to disk" },
  args: {
    json: { type: "boolean", description: "JSON output" },
    "state-dir": { type: "string", description: "Override state directory" },
    "conversation-id-prefix": { type: "string", description: "Only include conversation IDs with this prefix" },
    limit: { type: "string", description: "Return at most N export records" },
  },
  async run({ args }) {
    const ctx = createCLIContext({ json: args.json, stateDir: args["state-dir"] });
    const conversationIdPrefix = normalizeConversationIdPrefix(typeof args["conversation-id-prefix"] === "string"
      ? args["conversation-id-prefix"]
      : undefined);
    const limit = parsePositiveInteger(typeof args.limit === "string" ? args.limit : undefined);
    const items = await listConversationCLIRecentExports({
      stateDir: ctx.stateDir,
      conversationIdPrefix,
      limit,
    });

    if (ctx.json) {
      ctx.output({
        exports: items,
        filter: {
          ...(conversationIdPrefix ? { conversationIdPrefix } : {}),
          ...(typeof limit === "number" ? { limit } : {}),
        },
      });
      return;
    }

    console.log(renderRecentConversationExports(items));
  },
});
