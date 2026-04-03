import { defineCommand } from "citty";
import { createCLIContext } from "../../shared/context.js";
import {
  createConversationStoreForCLI,
  hasTimelineLikeData,
  recordConversationCLIExport,
  renderTimelineProjectionText,
  resolveConversationCLIOutputPath,
  writeConversationCommandOutput,
} from "./_shared.js";
import {
  applyTimelineProjectionFilter,
  normalizeTimelineKinds,
  parseCommaSeparatedValues,
  parsePositiveInteger,
  SUPPORTED_TIMELINE_KINDS,
} from "../../../conversation-debug-projection.js";

export default defineCommand({
  meta: { name: "timeline", description: "Project a persisted conversation into a readable timeline" },
  args: {
    json: { type: "boolean", description: "JSON output" },
    "state-dir": { type: "string", description: "Override state directory" },
    "conversation-id": { type: "string", description: "Conversation ID", required: true },
    "preview-chars": { type: "string", description: "Preview length for message items" },
    kinds: { type: "string", description: `Filter timeline kinds: ${SUPPORTED_TIMELINE_KINDS.join(", ")}` },
    limit: { type: "string", description: "Keep only the newest N timeline items after filtering" },
    output: { type: "string", description: "Write timeline output to file" },
    "output-dir": { type: "string", description: "Write timeline output into a directory using a stable generated file name" },
  },
  async run({ args }) {
    const ctx = createCLIContext({ json: args.json, stateDir: args["state-dir"] });
    const conversationId = typeof args["conversation-id"] === "string" ? args["conversation-id"].trim() : "";
    const previewCharsRaw = typeof args["preview-chars"] === "string" ? Number(args["preview-chars"]) : undefined;
    const previewChars = typeof previewCharsRaw === "number" && Number.isFinite(previewCharsRaw)
      ? Math.max(24, Math.floor(previewCharsRaw))
      : undefined;
    const kindsRaw = parseCommaSeparatedValues(typeof args.kinds === "string" ? args.kinds : undefined);
    const kinds = normalizeTimelineKinds(kindsRaw);
    const limit = parsePositiveInteger(typeof args.limit === "string" ? args.limit : undefined);

    if (!conversationId) {
      ctx.error("conversation-id is required");
      process.exit(1);
    }
    if (kindsRaw && !kinds) {
      ctx.error(`kinds must be one or more of: ${SUPPORTED_TIMELINE_KINDS.join(", ")}`);
      process.exit(1);
    }

    const store = createConversationStoreForCLI(ctx.stateDir);
    const timeline = await store.buildConversationTimeline(conversationId, { previewChars });
    if (!hasTimelineLikeData(timeline)) {
      ctx.error(`Conversation '${conversationId}' not found or timeline data is empty`);
      process.exit(1);
    }

    const projectedTimeline = applyTimelineProjectionFilter(timeline, {
      kinds,
      limit,
    });
    const serialized = ctx.json
      ? JSON.stringify(projectedTimeline, null, 2)
      : renderTimelineProjectionText(projectedTimeline);
    const outputPath = await resolveConversationCLIOutputPath({
      output: typeof args.output === "string" ? args.output : undefined,
      outputDir: typeof args["output-dir"] === "string" ? args["output-dir"] : undefined,
      conversationId,
      artifact: "timeline",
      variant: ctx.json ? undefined : "text",
      extension: ctx.json ? "json" : "txt",
    });
    if (outputPath) {
      const targetPath = await writeConversationCommandOutput(outputPath, serialized);
      await recordConversationCLIExport({
        stateDir: ctx.stateDir,
        conversationId,
        artifact: "timeline",
        format: ctx.json ? "json" : "text",
        outputPath: targetPath,
        projectionFilter: projectedTimeline.projectionFilter,
      });
      if (ctx.json) {
        ctx.output({ output: targetPath, conversationId, previewChars: previewChars ?? 120 });
      } else {
        ctx.success(`Timeline written to ${targetPath}`);
      }
      return;
    }

    console.log(serialized);
  },
});
