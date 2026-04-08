import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveWorkspaceStateDir } from "@belldandy/protocol";
import type { ToolContext } from "../../types.js";
import { ptcRuntimeTool } from "./index.js";

const tempDirs: string[] = [];

function createContext(workspaceRoot: string): ToolContext {
  return {
    conversationId: "conv-ptc",
    workspaceRoot,
    policy: {
      allowedPaths: [],
      deniedPaths: [],
      allowedDomains: [],
      deniedDomains: [],
      maxTimeoutMs: 10_000,
      maxResponseBytes: 1024 * 1024,
    },
  };
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("ptc_runtime", () => {
  it("runs a controlled script against declared JSON inputs and writes artifacts", async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "belldandy-ptc-"));
    tempDirs.push(workspaceRoot);
    const stateDir = resolveWorkspaceStateDir(workspaceRoot);
    await fs.mkdir(stateDir, { recursive: true });

    const inputPath = path.join(workspaceRoot, "data.json");
    await fs.writeFile(inputPath, JSON.stringify([
      { id: 1, score: 3 },
      { id: 2, score: 5 },
      { id: 3, score: 7 },
    ], null, 2), "utf-8");

    const result = await ptcRuntimeTool.execute({
      inputs: { records: "data.json" },
      inputFormats: { records: "json" },
      script: [
        "const rows = ptc.readJson('records');",
        "const total = rows.reduce((sum, item) => sum + item.score, 0);",
        "ptc.writeJson('summary.json', { total, count: rows.length });",
        "ptc.setResult({ total, count: rows.length, average: total / rows.length });",
      ].join("\n"),
    }, createContext(workspaceRoot));

    expect(result.success).toBe(true);
    const payload = JSON.parse(result.output);
    expect(payload.inputCount).toBe(1);
    expect(payload.artifactCount).toBe(1);
    expect(payload.artifacts).toContain("summary.json");
    expect(payload.resultPreview).toContain("\"average\": 5");

    const runDir = path.join(stateDir, "generated", "ptc-runs", payload.runId);
    const manifest = JSON.parse(await fs.readFile(path.join(runDir, "manifest.json"), "utf-8"));
    const persistedResult = JSON.parse(await fs.readFile(path.join(runDir, "result.json"), "utf-8"));
    const artifact = JSON.parse(await fs.readFile(path.join(runDir, "artifacts", "summary.json"), "utf-8"));

    expect(manifest.status).toBe("success");
    expect(manifest.inputs[0].id).toBe("records");
    expect(persistedResult.average).toBe(5);
    expect(artifact.total).toBe(15);
  });

  it("blocks inputs outside allowed roots", async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "belldandy-ptc-"));
    const outsideRoot = await fs.mkdtemp(path.join(os.tmpdir(), "belldandy-ptc-outside-"));
    tempDirs.push(workspaceRoot, outsideRoot);
    const outsidePath = path.join(outsideRoot, "outside.json");
    await fs.writeFile(outsidePath, "{\"ok\":true}", "utf-8");

    const result = await ptcRuntimeTool.execute({
      inputs: { leak: outsidePath },
      script: "return { ok: true };",
    }, createContext(workspaceRoot));

    expect(result.success).toBe(false);
    expect(result.error).toContain("PTC 输入路径超出允许范围");
  });

  it("requires a result value", async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "belldandy-ptc-"));
    tempDirs.push(workspaceRoot);

    const result = await ptcRuntimeTool.execute({
      script: "const x = 1 + 1;",
    }, createContext(workspaceRoot));

    expect(result.success).toBe(false);
    expect(result.error).toContain("没有返回结果");
  });

  it("blocks forbidden runtime access patterns before execution", async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "belldandy-ptc-"));
    tempDirs.push(workspaceRoot);

    const result = await ptcRuntimeTool.execute({
      script: "const fs = require('fs'); return { ok: !!fs };",
    }, createContext(workspaceRoot));

    expect(result.success).toBe(false);
    expect(result.error).toContain("require");
  });

  it("times out runaway scripts", async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "belldandy-ptc-"));
    tempDirs.push(workspaceRoot);

    const result = await ptcRuntimeTool.execute({
      timeoutMs: 100,
      script: "while (true) {}",
    }, createContext(workspaceRoot));

    expect(result.success).toBe(false);
    expect(result.error?.toLowerCase()).toContain("timed out");
  });

  it("exposes MCP aggregation helpers and markdown report helpers", async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "belldandy-ptc-"));
    tempDirs.push(workspaceRoot);
    const stateDir = resolveWorkspaceStateDir(workspaceRoot);
    await fs.mkdir(stateDir, { recursive: true });

    const inputPath = path.join(workspaceRoot, "mcp.json");
    await fs.writeFile(inputPath, JSON.stringify([
      {
        content: [
          { type: "text", text: "alpha" },
          { type: "resource", uri: "resource://docs/a", text: "beta", mimeType: "text/plain", truncated: true, note: "truncated preview" },
        ],
        diagnostics: {
          persistedWebPath: "/generated/mcp-saved.json",
        },
      },
    ], null, 2), "utf-8");

    const result = await ptcRuntimeTool.execute({
      inputs: { mcp: "mcp.json" },
      inputFormats: { mcp: "json" },
      script: [
        "const raw = ptc.readJson('mcp');",
        "const summary = ptc.helpers.mcp.summarizeResults(raw);",
        "const rows = ptc.helpers.records.groupCount([{ status: 'done' }, { status: 'done' }, { status: 'running' }], 'status');",
        "const table = ptc.helpers.report.toMarkdownTable(rows, ['value', 'count']);",
        "const reportPath = ptc.helpers.report.writeMarkdownReport('report.md', {",
        "  title: 'PTC Report',",
        "  sections: [",
        "    { title: 'MCP Summary', body: JSON.stringify(summary, null, 2) },",
        "    { title: 'Counts', body: table },",
        "  ],",
        "});",
        "ptc.setResult({ summary, reportPath, rows });",
      ].join('\n'),
    }, createContext(workspaceRoot));

    expect(result.success).toBe(true);
    const payload = JSON.parse(result.output);
    expect(payload.artifacts).toContain("report.md");
    expect(payload.resultPreview).toContain("\"totalItems\": 3");
    expect(payload.resultPreview).toContain("\"reportPath\": \"report.md\"");

    const report = await fs.readFile(path.join(stateDir, "generated", "ptc-runs", payload.runId, "artifacts", "report.md"), "utf-8");
    expect(report).toContain("# PTC Report");
    expect(report).toContain("## MCP Summary");
    expect(report).toContain("| value | count |");
  });

  it("exposes record analysis helpers for task or memory style arrays", async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "belldandy-ptc-"));
    tempDirs.push(workspaceRoot);

    const inputPath = path.join(workspaceRoot, "tasks.json");
    await fs.writeFile(inputPath, JSON.stringify([
      { id: "t1", status: "done", durationMs: 120, source: "goal" },
      { id: "t2", status: "done", durationMs: 180, source: "goal" },
      { id: "t3", status: "failed", durationMs: 90, source: "subtask" },
    ], null, 2), "utf-8");

    const result = await ptcRuntimeTool.execute({
      inputs: { tasks: "tasks.json" },
      inputFormats: { tasks: "json" },
      script: [
        "const tasks = ptc.readJson('tasks');",
        "const summary = ptc.helpers.records.summarize(tasks, { fields: ['status', 'durationMs', 'source'] });",
        "const sorted = ptc.helpers.records.sortBy(tasks, 'durationMs', 'desc');",
        "const picked = ptc.helpers.records.pick(sorted, ['id', 'status', 'durationMs']);",
        "ptc.setResult({ summary, first: picked[0], grouped: ptc.helpers.records.groupCount(tasks, 'status') });",
      ].join('\n'),
    }, createContext(workspaceRoot));

    expect(result.success).toBe(true);
    const payload = JSON.parse(result.output);
    expect(payload.resultPreview).toContain("\"fieldCount\": 3");
    expect(payload.resultPreview).toContain("\"average\": 130");
    expect(payload.resultPreview).toContain("\"id\": \"t2\"");
  });

  it("exposes narrower PTC templates for MCP report, record report, and dataset comparison", async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "belldandy-ptc-"));
    tempDirs.push(workspaceRoot);
    const stateDir = resolveWorkspaceStateDir(workspaceRoot);
    await fs.mkdir(stateDir, { recursive: true });

    const mcpPath = path.join(workspaceRoot, "mcp.json");
    const tasksPath = path.join(workspaceRoot, "tasks.json");
    const memoryPath = path.join(workspaceRoot, "memory.json");

    await fs.writeFile(mcpPath, JSON.stringify([
      {
        content: [
          { type: "text", text: "gamma" },
          { type: "text", text: "delta", truncated: true, note: "partial" },
        ],
        diagnostics: {
          persistedWebPath: "/generated/mcp-template.json",
        },
      },
    ], null, 2), "utf-8");
    await fs.writeFile(tasksPath, JSON.stringify([
      { id: "t1", status: "done", durationMs: 20 },
      { id: "t2", status: "failed", durationMs: 50 },
      { id: "t3", status: "done", durationMs: 30 },
    ], null, 2), "utf-8");
    await fs.writeFile(memoryPath, JSON.stringify([
      { id: "m1", status: "saved", durationMs: 10 },
      { id: "m2", status: "saved", durationMs: 15 },
    ], null, 2), "utf-8");

    const result = await ptcRuntimeTool.execute({
      inputs: {
        mcp: "mcp.json",
        tasks: "tasks.json",
        memory: "memory.json",
      },
      inputFormats: {
        mcp: "json",
        tasks: "json",
        memory: "json",
      },
      script: [
        "const mcpReport = ptc.helpers.templates.mcpResultReport(ptc.readJson('mcp'), {",
        "  markdownPath: 'mcp-report.md',",
        "  jsonPath: 'mcp-report.json',",
        "});",
        "const taskReport = ptc.helpers.templates.recordCollectionReport(ptc.readJson('tasks'), {",
        "  fields: ['id', 'status', 'durationMs'],",
        "  groupBy: 'status',",
        "  sortBy: 'durationMs',",
        "  sortDirection: 'desc',",
        "  markdownPath: 'task-report.md',",
        "  jsonPath: 'task-report.json',",
        "});",
        "const compare = ptc.helpers.templates.compareRecordSets({",
        "  tasks: ptc.readJson('tasks'),",
        "  memory: ptc.readJson('memory'),",
        "}, {",
        "  metricField: 'durationMs',",
        "  groupBy: 'status',",
        "  markdownPath: 'compare.md',",
        "  jsonPath: 'compare.json',",
        "});",
        "ptc.setResult({",
        "  mcpReport,",
        "  taskReport,",
        "  compare,",
        "});",
      ].join('\n'),
    }, createContext(workspaceRoot));

    expect(result.success).toBe(true);
    const payload = JSON.parse(result.output);
    expect(payload.artifacts).toContain("mcp-report.md");
    expect(payload.artifacts).toContain("task-report.md");
    expect(payload.artifacts).toContain("compare.md");
    expect(payload.resultPreview).toContain("\"kind\": \"mcp_result_report\"");
    expect(payload.resultPreview).toContain("\"kind\": \"record_collection_report\"");
    expect(payload.resultPreview).toContain("\"kind\": \"record_set_comparison\"");

    const runDir = path.join(stateDir, "generated", "ptc-runs", payload.runId, "artifacts");
    const compareReport = await fs.readFile(path.join(runDir, "compare.md"), "utf-8");
    expect(compareReport).toContain("# Record Set Comparison");
    expect(compareReport).toContain("| dataset | total |");
  });
});
