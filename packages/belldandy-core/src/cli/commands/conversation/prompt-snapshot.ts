import { defineCommand } from "citty";

import { createCLIContext } from "../../shared/context.js";
import {
  loadConversationPromptSnapshotForCLI,
  recordConversationCLIExport,
  renderConversationPromptSnapshotArtifactText,
  resolveConversationCLIOutputPath,
  writeConversationCommandOutput,
} from "./_shared.js";

export default defineCommand({
  meta: { name: "prompt-snapshot", description: "Export the latest or a specific persisted prompt snapshot for a conversation" },
  args: {
    json: { type: "boolean", description: "JSON output" },
    "state-dir": { type: "string", description: "Override state directory" },
    "conversation-id": { type: "string", description: "Conversation ID", required: true },
    "run-id": { type: "string", description: "Specific run ID (defaults to latest persisted snapshot for the conversation)" },
    output: { type: "string", description: "Write prompt snapshot output to file" },
    "output-dir": { type: "string", description: "Write prompt snapshot output into a directory using a stable generated file name" },
  },
  async run({ args }) {
    const ctx = createCLIContext({ json: args.json, stateDir: args["state-dir"] });
    const conversationId = typeof args["conversation-id"] === "string" ? args["conversation-id"].trim() : "";
    const runId = typeof args["run-id"] === "string" ? args["run-id"].trim() || undefined : undefined;

    if (!conversationId) {
      ctx.error("conversation-id is required");
      process.exit(1);
    }

    const snapshotView = await loadConversationPromptSnapshotForCLI({
      stateDir: ctx.stateDir,
      conversationId,
      runId,
    });
    if (!snapshotView) {
      ctx.error(
        runId
          ? `Prompt snapshot for conversation '${conversationId}' and run '${runId}' was not found`
          : `Prompt snapshot for conversation '${conversationId}' was not found`,
      );
      process.exit(1);
    }

    const artifact = snapshotView.artifact;
    const serialized = ctx.json
      ? JSON.stringify(artifact, null, 2)
      : renderConversationPromptSnapshotArtifactText(snapshotView);
    const outputPath = await resolveConversationCLIOutputPath({
      output: typeof args.output === "string" ? args.output : undefined,
      outputDir: typeof args["output-dir"] === "string" ? args["output-dir"] : undefined,
      conversationId,
      artifact: "prompt_snapshot",
      variant: runId ?? artifact.manifest.runId ?? (ctx.json ? undefined : "text"),
      extension: ctx.json ? "json" : "txt",
    });
    if (outputPath) {
      const targetPath = await writeConversationCommandOutput(outputPath, serialized);
      await recordConversationCLIExport({
        stateDir: ctx.stateDir,
        conversationId,
        artifact: "prompt_snapshot",
        format: ctx.json ? "json" : "text",
        outputPath: targetPath,
        projectionFilter: runId ? { runId } : undefined,
      });
      if (ctx.json) {
        ctx.output({
          output: targetPath,
          conversationId,
          ...(artifact.manifest.runId ? { runId: artifact.manifest.runId } : {}),
        });
      } else {
        ctx.success(`Prompt snapshot written to ${targetPath}`);
      }
      return;
    }

    console.log(serialized);
  },
});
