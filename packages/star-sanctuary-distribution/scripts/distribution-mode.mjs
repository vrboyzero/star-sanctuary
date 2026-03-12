import fs from "node:fs";
import path from "node:path";

const VALID_MODES = new Set(["slim", "full"]);

function normalizeMode(value) {
  if (!value || typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  return VALID_MODES.has(normalized) ? normalized : undefined;
}

function readCliMode(argv) {
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--mode") {
      return normalizeMode(argv[i + 1]);
    }
    if (arg.startsWith("--mode=")) {
      return normalizeMode(arg.slice("--mode=".length));
    }
  }
  return undefined;
}

export function resolveDistributionMode(params = {}) {
  const argv = params.argv ?? process.argv.slice(2);
  const env = params.env ?? process.env;
  const cliMode = readCliMode(argv);
  if (cliMode) {
    return {
      mode: cliMode,
      includeOptionalNative: cliMode === "full",
    };
  }

  const envCandidates = [
    env.STAR_SANCTUARY_DISTRIBUTION_MODE,
    env.BELLDANDY_DISTRIBUTION_MODE,
    env.STAR_SANCTUARY_PORTABLE_MODE,
    env.BELLDANDY_PORTABLE_MODE,
    env.STAR_SANCTUARY_SINGLE_EXE_MODE,
    env.BELLDANDY_SINGLE_EXE_MODE,
  ];

  for (const candidate of envCandidates) {
    const mode = normalizeMode(candidate);
    if (mode) {
      return {
        mode,
        includeOptionalNative: mode === "full",
      };
    }
  }

  if (env.STAR_SANCTUARY_PORTABLE_INCLUDE_OPTIONAL_NATIVE === "true") {
    return {
      mode: "full",
      includeOptionalNative: true,
    };
  }

  return {
    mode: "slim",
    includeOptionalNative: false,
  };
}

export function getArtifactVariantName(params) {
  const { platform, arch, mode } = params;
  return mode === "full" ? `${platform}-${arch}-full` : `${platform}-${arch}`;
}

function readWorkspaceVersion(workspaceRoot) {
  const packageJsonPath = path.join(workspaceRoot, "package.json");
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
  return typeof packageJson.version === "string" && packageJson.version.trim()
    ? packageJson.version.trim()
    : "0.0.0";
}

export function resolvePortableArtifactRoot(params) {
  const { workspaceRoot, platform, arch, mode } = params;
  return path.join(workspaceRoot, "artifacts", "portable", getArtifactVariantName({ platform, arch, mode }));
}

export function resolveSingleExeArtifactRoot(params) {
  const { workspaceRoot, platform, arch, mode } = params;
  const version = params.version ?? readWorkspaceVersion(workspaceRoot);
  return path.join(
    workspaceRoot,
    "artifacts",
    "single-exe",
    `star-sanctuary-single-exe-${getArtifactVariantName({ platform, arch, mode })}-v${version}`,
  );
}

export function getModeLogSuffix(mode) {
  return mode === "full" ? "-full" : "";
}
