import crypto from "node:crypto";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { resolveWorkspaceStateDir } from "@belldandy/protocol";
import type { JsonObject, Tool, ToolCallResult, ToolContext } from "../../types.js";
import { withToolContract } from "../../tool-contract.js";
import { resolveRuntimeFilesystemScope } from "../../runtime-policy.js";
import { createPtcHelpers } from "./helpers.js";

const TOOL_NAME = "ptc_runtime";
const PTC_RUNS_DIR = "generated/ptc-runs";
const DEFAULT_TIMEOUT_MS = 2_000;
const MAX_TIMEOUT_MS = 10_000;
const MAX_SCRIPT_CHARS = 20_000;
const MAX_INPUT_COUNT = 12;
const MAX_SINGLE_INPUT_BYTES = 2 * 1024 * 1024;
const MAX_TOTAL_INPUT_BYTES = 8 * 1024 * 1024;
const MAX_LOG_LINES = 20;
const MAX_LOG_CHARS = 400;
const RESULT_PREVIEW_CHARS = 4_000;
const BLOCKED_SCRIPT_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\brequire\s*\(/, reason: "PTC 脚本不能使用 require()." },
  { pattern: /\bimport\s*\(/, reason: "PTC 脚本不能动态 import()." },
  { pattern: /\bprocess\b/, reason: "PTC 脚本不能访问 process." },
  { pattern: /\bchild_process\b/, reason: "PTC 脚本不能启动子进程." },
  { pattern: /\bfetch\s*\(/, reason: "PTC 脚本不能发起网络请求." },
  { pattern: /\bXMLHttpRequest\b/, reason: "PTC 脚本不能发起网络请求." },
  { pattern: /\bWebSocket\b/, reason: "PTC 脚本不能建立网络连接." },
];

type InputFormat = "auto" | "json" | "text";

type LoadedInput = {
  id: string;
  path: string;
  absolutePath: string;
  format: InputFormat;
  sizeBytes: number;
  text: string;
  parsedJson?: unknown;
};

type ArtifactRecord = {
  path: string;
  type: "text" | "json";
};

type ManifestRecord = {
  version: 1;
  toolName: typeof TOOL_NAME;
  runId: string;
  createdAt: string;
  status: "success" | "error";
  workspaceRoot: string;
  inputBaseDir: string;
  timeoutMs: number;
  inputs: Array<{
    id: string;
    path: string;
    absolutePath: string;
    format: InputFormat;
    sizeBytes: number;
  }>;
  artifacts: ArtifactRecord[];
  resultPath?: string;
  error?: string;
};

function makeResult(
  runId: string,
  start: number,
  success: boolean,
  output: string,
  error?: string,
): ToolCallResult {
  return {
    id: runId,
    name: TOOL_NAME,
    success,
    output,
    error,
    durationMs: Date.now() - start,
  };
}

function isAbsoluteLike(input: string): boolean {
  return path.isAbsolute(input) || /^[A-Za-z]:/.test(input) || input.startsWith("\\\\");
}

function isUnderRoot(targetPath: string, rootPath: string): boolean {
  const relative = path.relative(path.resolve(rootPath), path.resolve(targetPath));
  return !(relative.startsWith("..") || path.isAbsolute(relative));
}

function isUnderAllowedRoots(targetPath: string, workspaceRoot: string, extraWorkspaceRoots?: string[]): boolean {
  if (isUnderRoot(targetPath, workspaceRoot)) return true;
  return (extraWorkspaceRoots ?? []).some((root) => isUnderRoot(targetPath, root));
}

function normalizeInputMapping(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const entries = Object.entries(raw as Record<string, unknown>);
  const normalized: Record<string, string> = {};
  for (const [key, value] of entries) {
    const id = key.trim();
    const filePath = typeof value === "string" ? value.trim() : "";
    if (!id || !filePath) continue;
    normalized[id] = filePath;
  }
  return normalized;
}

function normalizeFormatHints(raw: unknown): Record<string, InputFormat> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const normalized: Record<string, InputFormat> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const id = key.trim();
    const format = typeof value === "string" ? value.trim().toLowerCase() : "";
    if (!id) continue;
    if (format === "json" || format === "text" || format === "auto") {
      normalized[id] = format;
    }
  }
  return normalized;
}

function sanitizeInputId(value: string): string {
  return value.trim();
}

function validateInputIds(inputIds: string[]): string | undefined {
  for (const id of inputIds) {
    if (!/^[A-Za-z0-9._-]{1,64}$/.test(id)) {
      return `非法 input id: ${id}`;
    }
  }
  return undefined;
}

function resolveInputBaseDir(
  context: ToolContext,
  scope: { workspaceRoot: string; extraWorkspaceRoots?: string[] },
): string {
  if (context.defaultCwd) {
    const resolved = isAbsoluteLike(context.defaultCwd)
      ? path.resolve(context.defaultCwd)
      : path.resolve(scope.workspaceRoot, context.defaultCwd);
    if (isUnderAllowedRoots(resolved, scope.workspaceRoot, scope.extraWorkspaceRoots)) {
      return resolved;
    }
  }
  return path.resolve(scope.workspaceRoot);
}

function displayPath(absolutePath: string, workspaceRoot: string, extraWorkspaceRoots?: string[]): string {
  const resolvedWorkspaceRoot = path.resolve(workspaceRoot);
  const resolvedPath = path.resolve(absolutePath);
  if (isUnderRoot(resolvedPath, resolvedWorkspaceRoot)) {
    const relative = path.relative(resolvedWorkspaceRoot, resolvedPath);
    return relative || ".";
  }
  for (const root of extraWorkspaceRoots ?? []) {
    const resolvedRoot = path.resolve(root);
    if (isUnderRoot(resolvedPath, resolvedRoot)) {
      const relative = path.relative(resolvedRoot, resolvedPath);
      return `[extra:${path.basename(resolvedRoot)}]${relative ? `/${relative.replace(/\\/g, "/")}` : ""}`;
    }
  }
  return resolvedPath;
}

function normalizeArtifactRelativePath(filePath: string): string {
  const normalized = filePath.trim().replace(/\\/g, "/");
  if (!normalized) {
    throw new Error("产物路径不能为空。");
  }
  if (normalized.startsWith("/") || normalized.includes("..")) {
    throw new Error(`产物路径超出受控目录: ${filePath}`);
  }
  return normalized;
}

function captureConsoleLine(args: unknown[]): string {
  return args
    .map((item) => {
      if (typeof item === "string") return item;
      try {
        return JSON.stringify(item);
      } catch {
        return String(item);
      }
    })
    .join(" ")
    .slice(0, MAX_LOG_CHARS);
}

function sanitizeResultValue<T = unknown>(value: T): T {
  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch (error) {
    throw new Error(`PTC result 必须是可 JSON 序列化的数据: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function formatPreview(value: unknown): string {
  const serialized = JSON.stringify(value, null, 2);
  if (serialized.length <= RESULT_PREVIEW_CHARS) {
    return serialized;
  }
  return `${serialized.slice(0, RESULT_PREVIEW_CHARS)}\n... [truncated ${serialized.length - RESULT_PREVIEW_CHARS} chars]`;
}

async function loadInputs(
  mapping: Record<string, string>,
  formatHints: Record<string, InputFormat>,
  context: ToolContext,
  scope: { workspaceRoot: string; extraWorkspaceRoots?: string[] },
): Promise<LoadedInput[]> {
  const entries = Object.entries(mapping);
  if (entries.length > MAX_INPUT_COUNT) {
    throw new Error(`PTC 最多只允许 ${MAX_INPUT_COUNT} 个输入文件。`);
  }

  const inputBaseDir = resolveInputBaseDir(context, scope);
  const loaded: LoadedInput[] = [];
  let totalBytes = 0;

  for (const [rawId, rawPath] of entries) {
    const id = sanitizeInputId(rawId);
    const absolutePath = isAbsoluteLike(rawPath)
      ? path.resolve(rawPath)
      : path.resolve(inputBaseDir, rawPath);

    if (!isUnderAllowedRoots(absolutePath, scope.workspaceRoot, scope.extraWorkspaceRoots)) {
      throw new Error(`PTC 输入路径超出允许范围: ${rawPath}`);
    }

    const stat = await fsPromises.stat(absolutePath).catch(() => null);
    if (!stat || !stat.isFile()) {
      throw new Error(`PTC 输入文件不存在或不是普通文件: ${rawPath}`);
    }
    if (stat.size > MAX_SINGLE_INPUT_BYTES) {
      throw new Error(`PTC 输入文件过大: ${rawPath} (${stat.size} bytes)`);
    }

    totalBytes += stat.size;
    if (totalBytes > MAX_TOTAL_INPUT_BYTES) {
      throw new Error(`PTC 输入文件总量超过限制 (${MAX_TOTAL_INPUT_BYTES} bytes)。`);
    }

    const text = await fsPromises.readFile(absolutePath, "utf-8");
    const format = formatHints[id] ?? "auto";
    let parsedJson: unknown;

    if (format === "json") {
      try {
        parsedJson = JSON.parse(text);
      } catch (error) {
        throw new Error(`PTC 输入 ${id} 不是合法 JSON: ${error instanceof Error ? error.message : String(error)}`);
      }
    } else if (format === "auto") {
      const trimmed = text.trim();
      if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        try {
          parsedJson = JSON.parse(text);
        } catch {
          // Keep as text when auto-detection fails.
        }
      }
    }

    loaded.push({
      id,
      path: rawPath,
      absolutePath,
      format,
      sizeBytes: stat.size,
      text,
      parsedJson,
    });
  }

  return loaded;
}

function createSandbox(input: {
  loadedInputs: LoadedInput[];
  artifactsDir: string;
  workspaceRoot: string;
  extraWorkspaceRoots?: string[];
  logs: string[];
  artifacts: ArtifactRecord[];
  runId: string;
}): {
  context: vm.Context;
  getResult: () => unknown;
} {
  const inputMap = new Map<string, LoadedInput>(input.loadedInputs.map((item) => [item.id, item]));
  let explicitResult: unknown = undefined;
  let hasExplicitResult = false;

  const writeText = (relativePath: string, content: string): string => {
    const normalized = normalizeArtifactRelativePath(relativePath);
    const absolutePath = path.resolve(input.artifactsDir, normalized);
    if (!isUnderRoot(absolutePath, input.artifactsDir)) {
      throw new Error(`产物路径超出受控目录: ${relativePath}`);
    }
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, content, "utf-8");
    input.artifacts.push({ path: normalized, type: "text" });
    return normalized;
  };

  const writeJson = (relativePath: string, value: unknown): string => {
    const normalizedValue = sanitizeResultValue(value);
    return writeText(relativePath, JSON.stringify(normalizedValue, null, 2));
  };

  const ptcApi = Object.freeze({
    runId: input.runId,
    inputs: Object.freeze(input.loadedInputs.map((item) => Object.freeze({
      id: item.id,
      path: item.path,
      absolutePath: item.absolutePath,
      displayPath: displayPath(item.absolutePath, input.workspaceRoot, input.extraWorkspaceRoots),
      format: item.format,
      sizeBytes: item.sizeBytes,
      hasJson: typeof item.parsedJson !== "undefined",
    }))),
    readText: (id: string): string => {
      const item = inputMap.get(String(id));
      if (!item) throw new Error(`未知输入: ${id}`);
      return item.text;
    },
    readJson: (id: string): unknown => {
      const item = inputMap.get(String(id));
      if (!item) throw new Error(`未知输入: ${id}`);
      if (typeof item.parsedJson === "undefined") {
        throw new Error(`输入 ${id} 当前没有可用 JSON 内容，请改用 ptc.readText().`);
      }
      return sanitizeResultValue(item.parsedJson);
    },
    writeText: (relativePath: string, content: string): string => writeText(relativePath, String(content)),
    writeJson: (relativePath: string, value: unknown): string => writeJson(relativePath, value),
    log: (...args: unknown[]): void => {
      if (input.logs.length >= MAX_LOG_LINES) return;
      input.logs.push(captureConsoleLine(args));
    },
    setResult: (value: unknown): unknown => {
      explicitResult = sanitizeResultValue(value);
      hasExplicitResult = true;
      return explicitResult;
    },
    helpers: createPtcHelpers({
      writeText: (relativePath, content) => writeText(relativePath, content),
      writeJson: (relativePath, value) => writeJson(relativePath, value),
    }),
  });

  const safeConsole = Object.freeze({
    log: (...args: unknown[]) => ptcApi.log(...args),
    warn: (...args: unknown[]) => ptcApi.log(...args),
    error: (...args: unknown[]) => ptcApi.log(...args),
  });

  const sandbox = vm.createContext({
    ptc: ptcApi,
    console: safeConsole,
    require: undefined,
    process: undefined,
    Buffer: undefined,
    global: undefined,
    globalThis: undefined,
    module: undefined,
    exports: undefined,
    fetch: undefined,
    WebSocket: undefined,
    setTimeout: undefined,
    setInterval: undefined,
    setImmediate: undefined,
    clearTimeout: undefined,
    clearInterval: undefined,
    clearImmediate: undefined,
    Function: undefined,
    eval: undefined,
  }, {
    name: `${TOOL_NAME}:${input.runId}`,
    codeGeneration: {
      strings: false,
      wasm: false,
    },
  });

  return {
    context: sandbox,
    getResult: () => {
      if (hasExplicitResult) return explicitResult;
      return undefined;
    },
  };
}

export const ptcRuntimeTool: Tool = withToolContract({
  definition: {
    name: TOOL_NAME,
    description: "Run a controlled JavaScript PTC script for structured local data processing. The script can only read declared workspace files through the ptc API and can only write artifacts inside a managed run directory.",
    shortDescription: "受控结构化数据脚本运行面",
    parameters: {
      type: "object",
      properties: {
        script: {
          type: "string",
          description: "同步 JavaScript 脚本。使用 ptc.readJson/readText 读取声明过的输入，用 ptc.writeJson/writeText 输出产物，并用 ptc.setResult(...) 或 return 返回 JSON 结果。",
        },
        inputs: {
          type: "object",
          description: "输入文件映射：key 为 input id，value 为工作区内文件路径。适合 MCP 持久化结果、conversation export、task/memory JSON 等本地文件。",
        },
        inputFormats: {
          type: "object",
          description: "可选格式提示：key 为 input id，value 为 auto/json/text。json 会强制按 JSON 解析。",
        },
        timeoutMs: {
          type: "number",
          description: `脚本超时时间，默认 ${DEFAULT_TIMEOUT_MS}ms，最大 ${MAX_TIMEOUT_MS}ms。`,
        },
      },
      required: ["script"],
    },
    keywords: ["ptc", "structured data", "json", "analysis", "mcp"],
    tags: ["runtime", "data", "local-first"],
  },

  async execute(args: JsonObject, context: ToolContext): Promise<ToolCallResult> {
    const start = Date.now();
    const runId = crypto.randomUUID();
    const script = typeof args.script === "string" ? args.script : "";
    if (!script.trim()) {
      return makeResult(runId, start, false, "", "PTC 脚本不能为空。");
    }
    if (script.length > MAX_SCRIPT_CHARS) {
      return makeResult(runId, start, false, "", `PTC 脚本长度超过限制 (${MAX_SCRIPT_CHARS} chars)。`);
    }
    for (const blocked of BLOCKED_SCRIPT_PATTERNS) {
      if (blocked.pattern.test(script)) {
        return makeResult(runId, start, false, "", blocked.reason);
      }
    }

    const inputMapping = normalizeInputMapping(args.inputs);
    const inputIds = Object.keys(inputMapping);
    const invalidInputId = validateInputIds(inputIds);
    if (invalidInputId) {
      return makeResult(runId, start, false, "", invalidInputId);
    }

    const formatHints = normalizeFormatHints(args.inputFormats);
    const timeoutMs = typeof args.timeoutMs === "number" && Number.isFinite(args.timeoutMs)
      ? Math.max(100, Math.min(MAX_TIMEOUT_MS, Math.floor(args.timeoutMs)))
      : DEFAULT_TIMEOUT_MS;

    const scope = resolveRuntimeFilesystemScope(context);
    const workspaceStateDir = resolveWorkspaceStateDir(scope.workspaceRoot);
    const runDir = path.join(workspaceStateDir, PTC_RUNS_DIR, runId);
    const artifactsDir = path.join(runDir, "artifacts");
    const scriptPath = path.join(runDir, "script.js");
    const manifestPath = path.join(runDir, "manifest.json");
    const resultPath = path.join(runDir, "result.json");

    try {
      await fsPromises.mkdir(artifactsDir, { recursive: true });
      await fsPromises.writeFile(scriptPath, script, "utf-8");

      const loadedInputs = await loadInputs(inputMapping, formatHints, context, scope);
      const logs: string[] = [];
      const artifacts: ArtifactRecord[] = [];

      const manifest: ManifestRecord = {
        version: 1,
        toolName: TOOL_NAME,
        runId,
        createdAt: new Date().toISOString(),
        status: "success",
        workspaceRoot: scope.workspaceRoot,
        inputBaseDir: resolveInputBaseDir(context, scope),
        timeoutMs,
        inputs: loadedInputs.map((item) => ({
          id: item.id,
          path: item.path,
          absolutePath: item.absolutePath,
          format: item.format,
          sizeBytes: item.sizeBytes,
        })),
        artifacts,
      };

      const { context: sandbox, getResult } = createSandbox({
        loadedInputs,
        artifactsDir,
        workspaceRoot: scope.workspaceRoot,
        extraWorkspaceRoots: scope.extraWorkspaceRoots,
        logs,
        artifacts,
        runId,
      });

      const wrappedScript = [
        "\"use strict\";",
        "(() => {",
        script,
        "})()",
      ].join("\n");

      const compiled = new vm.Script(wrappedScript, {
        filename: `${TOOL_NAME}.js`,
      });

      const returnValue = compiled.runInContext(sandbox, {
        timeout: timeoutMs,
        displayErrors: true,
        breakOnSigint: false,
      });

      const normalizedResult = typeof getResult() !== "undefined"
        ? getResult()
        : typeof returnValue !== "undefined"
          ? sanitizeResultValue(returnValue)
          : undefined;

      if (typeof normalizedResult === "undefined") {
        throw new Error("PTC 脚本执行完成但没有返回结果。请使用 ptc.setResult(...) 或 return 一个 JSON 值。");
      }

      const persistedResult = sanitizeResultValue(normalizedResult);
      await fsPromises.writeFile(resultPath, JSON.stringify(persistedResult, null, 2), "utf-8");
      manifest.resultPath = resultPath;
      await fsPromises.writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");

      const responsePayload = {
        runId,
        runDir: displayPath(runDir, scope.workspaceRoot, scope.extraWorkspaceRoots),
        scriptPath: displayPath(scriptPath, scope.workspaceRoot, scope.extraWorkspaceRoots),
        manifestPath: displayPath(manifestPath, scope.workspaceRoot, scope.extraWorkspaceRoots),
        resultPath: displayPath(resultPath, scope.workspaceRoot, scope.extraWorkspaceRoots),
        inputCount: loadedInputs.length,
        artifactCount: artifacts.length,
        artifacts: artifacts.map((item) => item.path),
        logs,
        resultPreview: formatPreview(persistedResult),
      };

      return makeResult(runId, start, true, JSON.stringify(responsePayload, null, 2));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const failureManifest: ManifestRecord = {
        version: 1,
        toolName: TOOL_NAME,
        runId,
        createdAt: new Date().toISOString(),
        status: "error",
        workspaceRoot: scope.workspaceRoot,
        inputBaseDir: resolveInputBaseDir(context, scope),
        timeoutMs,
        inputs: [],
        artifacts: [],
        error: message,
      };
      await fsPromises.mkdir(runDir, { recursive: true }).catch(() => undefined);
      await fsPromises.writeFile(scriptPath, script, "utf-8").catch(() => undefined);
      await fsPromises.writeFile(manifestPath, JSON.stringify(failureManifest, null, 2), "utf-8").catch(() => undefined);
      return makeResult(
        runId,
        start,
        false,
        JSON.stringify({
          runId,
          manifestPath: displayPath(manifestPath, scope.workspaceRoot, scope.extraWorkspaceRoots),
          error: message,
        }, null, 2),
        message,
      );
    }
  },
}, {
  family: "command-exec",
  isReadOnly: false,
  isConcurrencySafe: false,
  needsPermission: true,
  riskLevel: "high",
  channels: ["gateway", "web"],
  safeScopes: ["privileged"],
  activityDescription: "Run a controlled PTC script against declared local structured-data inputs",
  resultSchema: {
    kind: "json",
    description: "Structured PTC run metadata with result preview and artifact paths.",
  },
  outputPersistencePolicy: "artifact",
});
