import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

type DoctorStatus = "pass" | "warn";
type OptionalCapabilityMode = "ready" | "fallback" | "inactive" | "policy" | "policy_gap";
type EmbeddingProvider = "openai" | "local";

type OptionalModuleProbe = {
  installed: boolean;
  available: boolean;
  checkedBy: "resolve" | "load";
  resolvedFrom?: string;
  error?: string;
};

type OptionalModuleProbeOptions = {
  load: boolean;
  resolveFromPaths?: string[];
};

export interface OptionalCapabilityDoctorItem {
  id: "pty" | "local_embedding" | "build_scripts";
  name: string;
  status: DoctorStatus;
  mode: OptionalCapabilityMode;
  message: string;
  impact: string;
  details: string[];
  fix?: string;
}

export interface OptionalCapabilitiesDoctorReport {
  summary: {
    totalCount: number;
    passCount: number;
    warnCount: number;
    degradedCount: number;
    headline: string;
    fix?: string;
  };
  items: OptionalCapabilityDoctorItem[];
}

export type OptionalCapabilitiesDoctorReportParams = {
  env?: Record<string, string | undefined>;
  workspaceRoot?: string;
  workspacePolicyRaw?: string;
  probeOptionalModule?: (moduleName: string, options: OptionalModuleProbeOptions) => Promise<OptionalModuleProbe>;
};

const EXPECTED_IGNORED_BUILD_DEPENDENCIES = [
  "node-pty",
  "onnxruntime-node",
  "protobufjs",
] as const;

const OPTIONAL_MODULE_RESOLVE_CONTEXTS: Record<string, string[]> = {
  "node-pty": [
    fileURLToPath(new URL("../../belldandy-skills/package.json", import.meta.url)),
  ],
  fastembed: [
    fileURLToPath(new URL("../../belldandy-memory/package.json", import.meta.url)),
  ],
};

function isEnabled(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === "true";
}

function resolveEmbeddingProvider(value: string | undefined): EmbeddingProvider {
  return value?.trim().toLowerCase() === "local" ? "local" : "openai";
}

function normalizeError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  return String(error);
}

function truncateError(error: string | undefined): string | undefined {
  if (!error) return undefined;
  return error.length > 160 ? `${error.slice(0, 157)}...` : error;
}

function parseYamlList(raw: string, key: string): string[] {
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  const startIndex = lines.findIndex((line) => line.trim() === `${key}:`);
  if (startIndex < 0) {
    return [];
  }
  const items: string[] = [];
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim()) {
      continue;
    }
    if (!/^\s+-\s+/.test(line)) {
      break;
    }
    items.push(line.replace(/^\s+-\s+/, "").trim());
  }
  return items;
}

async function defaultProbeOptionalModule(
  moduleName: string,
  options: OptionalModuleProbeOptions,
): Promise<OptionalModuleProbe> {
  const resolveFromPaths = Array.from(new Set([
    fileURLToPath(import.meta.url),
    ...(options.resolveFromPaths ?? []),
  ]));
  let resolvedFrom: string | undefined;
  let resolveError: unknown;
  for (const resolveFromPath of resolveFromPaths) {
    const require = createRequire(resolveFromPath);
    try {
      resolvedFrom = require.resolve(moduleName);
      break;
    } catch (error) {
      resolveError = error;
    }
  }
  if (!resolvedFrom) {
    return {
      installed: false,
      available: false,
      checkedBy: options.load ? "load" : "resolve",
      error: truncateError(normalizeError(resolveError)),
    };
  }

  if (!options.load) {
    return {
      installed: true,
      available: true,
      checkedBy: "resolve",
      resolvedFrom,
    };
  }

  try {
    await import(pathToFileURL(resolvedFrom).href);
    return {
      installed: true,
      available: true,
      checkedBy: "load",
      resolvedFrom,
    };
  } catch (error) {
    return {
      installed: true,
      available: false,
      checkedBy: "load",
      resolvedFrom,
      error: truncateError(normalizeError(error)),
    };
  }
}

function buildPtyItem(params: {
  toolsEnabled: boolean;
  probe: OptionalModuleProbe;
}): OptionalCapabilityDoctorItem {
  const { toolsEnabled, probe } = params;
  const warn = toolsEnabled && !probe.available;
  return {
    id: "pty",
    name: "PTY Terminal Backend",
    status: warn ? "warn" : "pass",
    mode: probe.available ? "ready" : "fallback",
    message: probe.available
      ? (toolsEnabled
        ? "Native PTY backend ready for terminal tools."
        : "Native PTY backend is installed for future terminal use.")
      : (toolsEnabled
        ? "Terminal tools will fall back to child_process; PTY fidelity is reduced."
        : "Native PTY is absent, but child_process fallback remains available if terminal tools are enabled later."),
    impact: toolsEnabled
      ? "Does not block startup; only terminal resize / PTY fidelity is affected."
      : "No impact on default startup while terminal tools stay disabled.",
    details: [
      `toolsEnabled=${toolsEnabled ? "true" : "false"}`,
      `backend=${probe.available ? "node-pty" : "child_process"}`,
      `probe=${probe.checkedBy}`,
      ...(probe.resolvedFrom ? [`resolvedFrom=${probe.resolvedFrom}`] : []),
      ...(probe.error ? [`error=${probe.error}`] : []),
    ],
    ...(warn
      ? { fix: "Install/rebuild optional dependency 'node-pty' if full PTY terminal support is required." }
      : {}),
  };
}

function buildLocalEmbeddingItem(params: {
  embeddingEnabled: boolean;
  embeddingProvider: EmbeddingProvider;
  probe: OptionalModuleProbe;
}): OptionalCapabilityDoctorItem {
  const { embeddingEnabled, embeddingProvider, probe } = params;
  const localActive = embeddingEnabled && embeddingProvider === "local";
  const warn = localActive && !probe.available;
  return {
    id: "local_embedding",
    name: "Local Embedding Backend",
    status: warn ? "warn" : "pass",
    mode: localActive
      ? (probe.available ? "ready" : "fallback")
      : "inactive",
    message: localActive
      ? (probe.available
        ? "Local embedding backend is ready."
        : "Local embedding is selected but optional dependency 'fastembed' is unavailable.")
      : !embeddingEnabled
        ? "Embedding is disabled; local embedding remains optional."
        : `Current embedding provider is ${embeddingProvider}; local embedding remains optional.`,
    impact: localActive
      ? "Does not block startup, but local vector generation/search may stay degraded until the optional dependency is available."
      : "No impact on the active startup path unless local embedding is explicitly selected.",
    details: [
      `embeddingEnabled=${embeddingEnabled ? "true" : "false"}`,
      `provider=${embeddingProvider}`,
      `probe=${probe.checkedBy}`,
      ...(probe.resolvedFrom ? [`resolvedFrom=${probe.resolvedFrom}`] : []),
      ...(probe.error ? [`error=${probe.error}`] : []),
    ],
    ...(warn
      ? { fix: "Install/rebuild optional dependency 'fastembed' before enabling BELLDANDY_EMBEDDING_PROVIDER=local." }
      : {}),
  };
}

function buildBuildScriptsItem(params: {
  workspaceRoot: string;
  workspacePolicyRaw?: string;
}): OptionalCapabilityDoctorItem {
  const workspacePolicyPath = path.join(params.workspaceRoot, "pnpm-workspace.yaml");
  let raw = params.workspacePolicyRaw;
  let readError: string | undefined;
  if (raw === undefined) {
    try {
      raw = fs.readFileSync(workspacePolicyPath, "utf-8");
    } catch (error) {
      readError = truncateError(normalizeError(error));
      raw = "";
    }
  }

  const ignoredBuiltDependencies = parseYamlList(raw, "ignoredBuiltDependencies");
  const missingExpected = EXPECTED_IGNORED_BUILD_DEPENDENCIES.filter((dependency) => !ignoredBuiltDependencies.includes(dependency));
  const warn = Boolean(readError) || missingExpected.length > 0;
  return {
    id: "build_scripts",
    name: "Optional Build-Script Policy",
    status: warn ? "warn" : "pass",
    mode: warn ? "policy_gap" : "policy",
    message: warn
      ? (readError
        ? "Workspace build-script policy could not be read."
        : `Workspace may reintroduce optional build-script noise (missing: ${missingExpected.join(", ")}).`)
      : "Workspace already ignores non-blocking optional build-script prompts.",
    impact: "Does not change runtime behavior; keeps install/build output aligned with optional dependency policy.",
    details: [
      `policyPath=${workspacePolicyPath}`,
      `ignoredBuiltDependencies=${ignoredBuiltDependencies.join(", ") || "(none)"}`,
      ...(readError ? [`error=${readError}`] : []),
    ],
    ...(warn
      ? {
        fix: readError
          ? `Restore ${workspacePolicyPath} so doctor can verify optional build-script policy.`
          : `Add ${missingExpected.join(", ")} to ignoredBuiltDependencies in ${workspacePolicyPath}.`,
      }
      : {}),
  };
}

export async function buildOptionalCapabilitiesDoctorReport(
  params: OptionalCapabilitiesDoctorReportParams = {},
): Promise<OptionalCapabilitiesDoctorReport> {
  const env = params.env ?? process.env;
  const workspaceRoot = params.workspaceRoot ?? process.cwd();
  const probeOptionalModule = params.probeOptionalModule ?? defaultProbeOptionalModule;

  const toolsEnabled = isEnabled(env.BELLDANDY_TOOLS_ENABLED);
  const embeddingEnabled = isEnabled(env.BELLDANDY_EMBEDDING_ENABLED);
  const embeddingProvider = resolveEmbeddingProvider(env.BELLDANDY_EMBEDDING_PROVIDER);

  const [ptyProbe, fastembedProbe] = await Promise.all([
    probeOptionalModule("node-pty", {
      load: toolsEnabled,
      resolveFromPaths: OPTIONAL_MODULE_RESOLVE_CONTEXTS["node-pty"],
    }),
    probeOptionalModule("fastembed", {
      load: embeddingEnabled && embeddingProvider === "local",
      resolveFromPaths: OPTIONAL_MODULE_RESOLVE_CONTEXTS.fastembed,
    }),
  ]);

  const items = [
    buildPtyItem({
      toolsEnabled,
      probe: ptyProbe,
    }),
    buildLocalEmbeddingItem({
      embeddingEnabled,
      embeddingProvider,
      probe: fastembedProbe,
    }),
    buildBuildScriptsItem({
      workspaceRoot,
      workspacePolicyRaw: params.workspacePolicyRaw,
    }),
  ];

  const passCount = items.filter((item) => item.status === "pass").length;
  const warnCount = items.filter((item) => item.status === "warn").length;
  const firstFix = items.find((item) => item.fix)?.fix;

  return {
    summary: {
      totalCount: items.length,
      passCount,
      warnCount,
      degradedCount: warnCount,
      headline: warnCount > 0
        ? `${warnCount} optional capability path(s) need attention, but default startup remains non-blocking.`
        : "Optional capability paths are aligned; default startup remains non-blocking.",
      ...(firstFix ? { fix: firstFix } : {}),
    },
    items,
  };
}
