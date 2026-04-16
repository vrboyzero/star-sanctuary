import fs from "node:fs/promises";
import path from "node:path";
import type { ToolContext } from "../../types.js";
import {
  BRIDGE_ARTIFACTS_DIR,
  type BridgeRunArtifactSummary,
  type BridgeSessionArtifactSummary,
  type BridgeSessionRecord,
  type BridgeSessionTranscriptEvent,
} from "./types.js";

export async function persistBridgeRunArtifacts(
  context: Pick<ToolContext, "workspaceRoot">,
  artifact: BridgeRunArtifactSummary,
  stdout: string,
  stderr: string,
): Promise<string> {
  const runDir = path.join(context.workspaceRoot, BRIDGE_ARTIFACTS_DIR, artifact.runId);
  await fs.mkdir(runDir, { recursive: true });

  let stdoutPath: string | undefined;
  let stderrPath: string | undefined;

  if (stdout) {
    stdoutPath = path.join(runDir, "stdout.txt");
    await fs.writeFile(stdoutPath, stdout, "utf-8");
  }
  if (stderr) {
    stderrPath = path.join(runDir, "stderr.txt");
    await fs.writeFile(stderrPath, stderr, "utf-8");
  }

  const summaryPath = path.join(runDir, "summary.json");
  const summary: BridgeRunArtifactSummary = {
    ...artifact,
    stdout: {
      ...artifact.stdout,
      path: stdoutPath,
    },
    stderr: {
      ...artifact.stderr,
      path: stderrPath,
    },
  };
  await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2), "utf-8");
  return summaryPath;
}

export async function persistBridgeSessionArtifacts(
  record: BridgeSessionRecord,
  transcript: BridgeSessionTranscriptEvent[],
): Promise<{ artifactPath: string; transcriptPath: string }> {
  const sessionDir = path.join(record.workspaceRoot, BRIDGE_ARTIFACTS_DIR, "sessions", record.id);
  await fs.mkdir(sessionDir, { recursive: true });

  const transcriptPath = path.join(sessionDir, "transcript.json");
  await fs.writeFile(transcriptPath, JSON.stringify({ events: transcript }, null, 2), "utf-8");

  const inputEvents = transcript.filter((event) => event.direction === "input");
  const outputEvents = transcript.filter((event) => event.direction === "output");
  const summary: BridgeSessionArtifactSummary = {
    version: 1,
    sessionId: record.id,
    targetId: record.targetId,
    action: record.action,
    transport: "pty",
    cwd: record.cwd,
    commandPreview: record.commandPreview,
    status: record.status,
    closeReason: record.closeReason,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    closedAt: record.closedAt,
    eventCount: transcript.length,
    inputEventCount: inputEvents.length,
    outputEventCount: outputEvents.length,
    inputBytes: inputEvents.reduce((sum, event) => sum + event.bytes, 0),
    outputBytes: outputEvents.reduce((sum, event) => sum + event.bytes, 0),
    transcriptPath,
  };

  const artifactPath = path.join(sessionDir, "summary.json");
  await fs.writeFile(artifactPath, JSON.stringify(summary, null, 2), "utf-8");
  return {
    artifactPath,
    transcriptPath,
  };
}
