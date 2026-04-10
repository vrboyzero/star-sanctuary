import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export type DeploymentBackendKind = "local" | "docker" | "ssh";
export type DeploymentWorkspaceMode = "direct" | "mount" | "sync";
export type DeploymentCredentialMode = "inherit_env" | "env_file" | "ssh_agent" | "ssh_key";
export type DeploymentLogMode = "local" | "docker" | "ssh" | "file";

export interface DeploymentBackendProfile {
  id: string;
  label?: string;
  backend: DeploymentBackendKind;
  enabled: boolean;
  runtime?: {
    service?: string;
    container?: string;
    image?: string;
    dockerContext?: string;
    composeFile?: string;
    host?: string;
    port?: number;
    user?: string;
  };
  workspace?: {
    mode: DeploymentWorkspaceMode;
    localPath?: string;
    remotePath?: string;
  };
  credentials?: {
    mode: DeploymentCredentialMode;
    ref?: string;
  };
  observability?: {
    logMode: DeploymentLogMode;
    ref?: string;
  };
}

export interface DeploymentBackendsConfig {
  version: 1;
  selectedProfileId?: string;
  profiles: DeploymentBackendProfile[];
}

export interface DeploymentBackendDoctorItem {
  id: string;
  label: string;
  backend: DeploymentBackendKind;
  enabled: boolean;
  selected: boolean;
  status: "pass" | "warn";
  targetSummary: string;
  message: string;
  warnings: string[];
  workspaceMode: DeploymentWorkspaceMode;
  credentialMode: DeploymentCredentialMode;
  logMode: DeploymentLogMode;
}

export interface DeploymentBackendsDoctorReport {
  available: boolean;
  configPath: string;
  configExists: boolean;
  config: DeploymentBackendsConfig;
  summary: {
    profileCount: number;
    enabledCount: number;
    warningCount: number;
    selectedProfileId?: string;
    selectedResolved: boolean;
    selectedBackend?: DeploymentBackendKind;
    backendCounts: Record<DeploymentBackendKind, number>;
    enabledBackendCounts: Record<DeploymentBackendKind, number>;
  };
  items: DeploymentBackendDoctorItem[];
  headline: string;
}

const RENAME_RETRIES = 3;
const RENAME_RETRY_DELAY_MS = 50;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized || undefined;
}

function normalizePort(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const normalized = Math.max(1, Math.min(65535, Math.floor(value)));
  return normalized;
}

function normalizeBackend(value: unknown): DeploymentBackendKind {
  return value === "docker" || value === "ssh" ? value : "local";
}

function getDefaultWorkspaceMode(backend: DeploymentBackendKind): DeploymentWorkspaceMode {
  if (backend === "docker") return "mount";
  if (backend === "ssh") return "sync";
  return "direct";
}

function getDefaultCredentialMode(backend: DeploymentBackendKind): DeploymentCredentialMode {
  if (backend === "ssh") return "ssh_agent";
  return "inherit_env";
}

function getDefaultLogMode(backend: DeploymentBackendKind): DeploymentLogMode {
  if (backend === "docker") return "docker";
  if (backend === "ssh") return "ssh";
  return "local";
}

export function buildDefaultDeploymentBackendsConfig(): DeploymentBackendsConfig {
  return {
    version: 1,
    selectedProfileId: "local-default",
    profiles: [
      {
        id: "local-default",
        label: "Local Default",
        backend: "local",
        enabled: true,
        workspace: {
          mode: "direct",
        },
        credentials: {
          mode: "inherit_env",
        },
        observability: {
          logMode: "local",
        },
      },
    ],
  };
}

export function normalizeDeploymentBackendsConfig(input: unknown): DeploymentBackendsConfig {
  const fallback = buildDefaultDeploymentBackendsConfig();
  const raw = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const profiles = Array.isArray(raw.profiles)
    ? raw.profiles
      .map((item, index) => normalizeDeploymentBackendProfile(item, index))
      .filter((item): item is DeploymentBackendProfile => Boolean(item))
    : fallback.profiles;
  const selectedProfileId = normalizeString(raw.selectedProfileId);
  return {
    version: 1,
    ...(selectedProfileId ? { selectedProfileId } : {}),
    profiles: profiles.length > 0 ? profiles : fallback.profiles,
  };
}

function normalizeDeploymentBackendProfile(
  input: unknown,
  index: number,
): DeploymentBackendProfile | undefined {
  if (!input || typeof input !== "object") return undefined;
  const raw = input as Record<string, unknown>;
  const backend = normalizeBackend(raw.backend);
  const id = normalizeString(raw.id) ?? `profile-${index + 1}`;
  const label = normalizeString(raw.label);
  const runtimeRaw = raw.runtime && typeof raw.runtime === "object" ? raw.runtime as Record<string, unknown> : {};
  const workspaceRaw = raw.workspace && typeof raw.workspace === "object" ? raw.workspace as Record<string, unknown> : {};
  const credentialsRaw = raw.credentials && typeof raw.credentials === "object" ? raw.credentials as Record<string, unknown> : {};
  const observabilityRaw = raw.observability && typeof raw.observability === "object" ? raw.observability as Record<string, unknown> : {};
  const workspaceMode = workspaceRaw.mode === "mount" || workspaceRaw.mode === "sync" || workspaceRaw.mode === "direct"
    ? workspaceRaw.mode
    : getDefaultWorkspaceMode(backend);
  const credentialMode = credentialsRaw.mode === "env_file"
    || credentialsRaw.mode === "ssh_agent"
    || credentialsRaw.mode === "ssh_key"
    || credentialsRaw.mode === "inherit_env"
    ? credentialsRaw.mode
    : getDefaultCredentialMode(backend);
  const logMode = observabilityRaw.logMode === "docker"
    || observabilityRaw.logMode === "ssh"
    || observabilityRaw.logMode === "file"
    || observabilityRaw.logMode === "local"
    ? observabilityRaw.logMode
    : getDefaultLogMode(backend);

  return {
    id,
    ...(label ? { label } : {}),
    backend,
    enabled: raw.enabled !== false,
    runtime: {
      ...(normalizeString(runtimeRaw.service) ? { service: normalizeString(runtimeRaw.service) } : {}),
      ...(normalizeString(runtimeRaw.container) ? { container: normalizeString(runtimeRaw.container) } : {}),
      ...(normalizeString(runtimeRaw.image) ? { image: normalizeString(runtimeRaw.image) } : {}),
      ...(normalizeString(runtimeRaw.dockerContext) ? { dockerContext: normalizeString(runtimeRaw.dockerContext) } : {}),
      ...(normalizeString(runtimeRaw.composeFile) ? { composeFile: normalizeString(runtimeRaw.composeFile) } : {}),
      ...(normalizeString(runtimeRaw.host) ? { host: normalizeString(runtimeRaw.host) } : {}),
      ...(typeof normalizePort(runtimeRaw.port) === "number" ? { port: normalizePort(runtimeRaw.port) } : {}),
      ...(normalizeString(runtimeRaw.user) ? { user: normalizeString(runtimeRaw.user) } : {}),
    },
    workspace: {
      mode: workspaceMode,
      ...(normalizeString(workspaceRaw.localPath) ? { localPath: normalizeString(workspaceRaw.localPath) } : {}),
      ...(normalizeString(workspaceRaw.remotePath) ? { remotePath: normalizeString(workspaceRaw.remotePath) } : {}),
    },
    credentials: {
      mode: credentialMode,
      ...(normalizeString(credentialsRaw.ref) ? { ref: normalizeString(credentialsRaw.ref) } : {}),
    },
    observability: {
      logMode,
      ...(normalizeString(observabilityRaw.ref) ? { ref: normalizeString(observabilityRaw.ref) } : {}),
    },
  };
}

export function resolveDeploymentBackendsConfigPath(stateDir: string): string {
  return path.join(stateDir, "deployment-backends.json");
}

async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const tmpFile = path.join(path.dirname(filePath), `${path.basename(filePath)}.${crypto.randomUUID()}.tmp`);
  const content = `${JSON.stringify(value, null, 2)}\n`;
  await fs.promises.writeFile(tmpFile, content, "utf-8");
  try {
    await fs.promises.chmod(tmpFile, 0o600);
  } catch {
    // ignore on unsupported platforms
  }

  let lastErr: NodeJS.ErrnoException | null = null;
  for (let attempt = 0; attempt < RENAME_RETRIES; attempt += 1) {
    try {
      await fs.promises.rename(tmpFile, filePath);
      return;
    } catch (error) {
      lastErr = error as NodeJS.ErrnoException;
      if (attempt < RENAME_RETRIES - 1) {
        await delay(RENAME_RETRY_DELAY_MS);
      }
    }
  }

  if (process.platform === "win32" && lastErr && (lastErr.code === "EPERM" || lastErr.code === "EBUSY")) {
    await fs.promises.writeFile(filePath, content, "utf-8");
    await fs.promises.unlink(tmpFile).catch(() => {});
    return;
  }

  await fs.promises.unlink(tmpFile).catch(() => {});
  throw lastErr;
}

export async function ensureDeploymentBackendsConfig(stateDir: string): Promise<void> {
  const configPath = resolveDeploymentBackendsConfigPath(stateDir);
  if (fs.existsSync(configPath)) {
    return;
  }
  await writeJsonAtomic(configPath, buildDefaultDeploymentBackendsConfig());
}

export function loadDeploymentBackendsConfig(stateDir: string): DeploymentBackendsConfig {
  const configPath = resolveDeploymentBackendsConfigPath(stateDir);
  try {
    const raw = fs.readFileSync(configPath, "utf-8");
    return normalizeDeploymentBackendsConfig(JSON.parse(raw) as unknown);
  } catch {
    return buildDefaultDeploymentBackendsConfig();
  }
}

function buildTargetSummary(profile: DeploymentBackendProfile): string {
  if (profile.backend === "docker") {
    return profile.runtime?.service
      ? `service=${profile.runtime.service}`
      : profile.runtime?.container
        ? `container=${profile.runtime.container}`
        : profile.runtime?.image
          ? `image=${profile.runtime.image}`
          : "service/container/image missing";
  }
  if (profile.backend === "ssh") {
    if (!profile.runtime?.host) {
      return "host missing";
    }
    const host = profile.runtime.user
      ? `${profile.runtime.user}@${profile.runtime.host}`
      : profile.runtime.host;
    return typeof profile.runtime.port === "number" ? `${host}:${profile.runtime.port}` : host;
  }
  return "current gateway process";
}

function buildWarnings(
  profile: DeploymentBackendProfile,
  duplicatedIds: Set<string>,
): string[] {
  const warnings: string[] = [];
  if (duplicatedIds.has(profile.id)) {
    warnings.push("duplicate profile id");
  }
  if (!profile.enabled) {
    return warnings;
  }
  if (profile.backend === "local") {
    if (profile.workspace?.mode !== "direct") {
      warnings.push("local backend should keep workspace.mode=direct");
    }
    if (profile.credentials?.mode !== "inherit_env" && profile.credentials?.mode !== "env_file") {
      warnings.push("local backend credentials should be inherit_env or env_file");
    }
    if (profile.credentials?.mode === "env_file" && !normalizeString(profile.credentials.ref)) {
      warnings.push("env_file credentials need credentials.ref");
    }
    if (profile.observability?.logMode !== "local" && profile.observability?.logMode !== "file") {
      warnings.push("local backend logMode should be local or file");
    }
  } else if (profile.backend === "docker") {
    if (!profile.runtime?.service && !profile.runtime?.container && !profile.runtime?.image) {
      warnings.push("docker backend needs runtime.service, runtime.container, or runtime.image");
    }
    if (profile.workspace?.mode !== "mount" && profile.workspace?.mode !== "sync") {
      warnings.push("docker backend workspace.mode should be mount or sync");
    }
    if (!normalizeString(profile.workspace?.remotePath)) {
      warnings.push("docker backend needs workspace.remotePath");
    }
    if (profile.credentials?.mode !== "inherit_env" && profile.credentials?.mode !== "env_file") {
      warnings.push("docker backend credentials should be inherit_env or env_file");
    }
    if (profile.credentials?.mode === "env_file" && !normalizeString(profile.credentials.ref)) {
      warnings.push("docker env_file credentials need credentials.ref");
    }
    if (profile.observability?.logMode !== "docker" && profile.observability?.logMode !== "file") {
      warnings.push("docker backend logMode should be docker or file");
    }
    if (profile.observability?.logMode === "file" && !normalizeString(profile.observability.ref)) {
      warnings.push("file logMode needs observability.ref");
    }
  } else if (profile.backend === "ssh") {
    if (!normalizeString(profile.runtime?.host)) {
      warnings.push("ssh backend needs runtime.host");
    }
    if (profile.workspace?.mode !== "mount" && profile.workspace?.mode !== "sync") {
      warnings.push("ssh backend workspace.mode should be mount or sync");
    }
    if (!normalizeString(profile.workspace?.remotePath)) {
      warnings.push("ssh backend needs workspace.remotePath");
    }
    if (profile.credentials?.mode !== "ssh_agent" && profile.credentials?.mode !== "ssh_key") {
      warnings.push("ssh backend credentials should be ssh_agent or ssh_key");
    }
    if (profile.credentials?.mode === "ssh_key" && !normalizeString(profile.credentials.ref)) {
      warnings.push("ssh_key credentials need credentials.ref");
    }
    if (profile.observability?.logMode !== "ssh" && profile.observability?.logMode !== "file") {
      warnings.push("ssh backend logMode should be ssh or file");
    }
    if (profile.observability?.logMode === "file" && !normalizeString(profile.observability.ref)) {
      warnings.push("file logMode needs observability.ref");
    }
  }
  return warnings;
}

export function buildDeploymentBackendsDoctorReport(input: {
  stateDir: string;
}): DeploymentBackendsDoctorReport {
  const configPath = resolveDeploymentBackendsConfigPath(input.stateDir);
  const configExists = fs.existsSync(configPath);
  const config = loadDeploymentBackendsConfig(input.stateDir);
  const idCounts = new Map<string, number>();
  for (const item of config.profiles) {
    idCounts.set(item.id, (idCounts.get(item.id) ?? 0) + 1);
  }
  const duplicatedIds = new Set(
    Array.from(idCounts.entries())
      .filter(([, count]) => count > 1)
      .map(([id]) => id),
  );
  const selectedProfile = config.selectedProfileId
    ? config.profiles.find((item) => item.id === config.selectedProfileId)
    : undefined;
  const items = config.profiles.map<DeploymentBackendDoctorItem>((profile) => {
    const warnings = buildWarnings(profile, duplicatedIds);
    const selected = Boolean(config.selectedProfileId) && profile.id === config.selectedProfileId;
    const targetSummary = buildTargetSummary(profile);
    const parts = [
      selected ? "selected" : "",
      profile.enabled ? "enabled" : "disabled",
      `backend=${profile.backend}`,
      `target=${targetSummary}`,
      `workspace=${profile.workspace?.mode ?? getDefaultWorkspaceMode(profile.backend)}`,
      `credentials=${profile.credentials?.mode ?? getDefaultCredentialMode(profile.backend)}`,
      `logs=${profile.observability?.logMode ?? getDefaultLogMode(profile.backend)}`,
    ].filter(Boolean);
    return {
      id: profile.id,
      label: profile.label ?? profile.id,
      backend: profile.backend,
      enabled: profile.enabled,
      selected,
      status: warnings.length > 0 ? "warn" : "pass",
      targetSummary,
      message: warnings.length > 0 ? `${parts.join(", ")}; ${warnings[0]}` : parts.join(", "),
      warnings,
      workspaceMode: profile.workspace?.mode ?? getDefaultWorkspaceMode(profile.backend),
      credentialMode: profile.credentials?.mode ?? getDefaultCredentialMode(profile.backend),
      logMode: profile.observability?.logMode ?? getDefaultLogMode(profile.backend),
    };
  });

  const backendCounts: Record<DeploymentBackendKind, number> = {
    local: 0,
    docker: 0,
    ssh: 0,
  };
  const enabledBackendCounts: Record<DeploymentBackendKind, number> = {
    local: 0,
    docker: 0,
    ssh: 0,
  };
  for (const item of items) {
    backendCounts[item.backend] += 1;
    if (item.enabled) {
      enabledBackendCounts[item.backend] += 1;
    }
  }

  let warningCount = items.filter((item) => item.status === "warn").length;
  if (!configExists) {
    warningCount += 1;
  }
  if (config.selectedProfileId && !selectedProfile) {
    warningCount += 1;
  }

  const headlineParts = [
    `profiles=${items.length}`,
    `enabled=${items.filter((item) => item.enabled).length}`,
    !configExists ? "config_missing=1" : "",
    `selected=${config.selectedProfileId ?? "-"}`,
    config.selectedProfileId && !selectedProfile ? "selected_missing=1" : "",
    `warnings=${warningCount}`,
    `local=${backendCounts.local}`,
    `docker=${backendCounts.docker}`,
    `ssh=${backendCounts.ssh}`,
  ].filter(Boolean);

  return {
    available: items.length > 0,
    configPath,
    configExists,
    config,
    summary: {
      profileCount: items.length,
      enabledCount: items.filter((item) => item.enabled).length,
      warningCount,
      ...(config.selectedProfileId ? { selectedProfileId: config.selectedProfileId } : {}),
      selectedResolved: Boolean(!config.selectedProfileId || selectedProfile),
      ...(selectedProfile ? { selectedBackend: selectedProfile.backend } : {}),
      backendCounts,
      enabledBackendCounts,
    },
    items,
    headline: headlineParts.join("; "),
  };
}
