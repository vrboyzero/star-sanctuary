import type { BelldandyLogger } from "./logger/index.js";

const DEFAULT_RELEASES_API_URL = "https://api.github.com/repos/vrboyzero/star-sanctuary/releases/latest";
const DEFAULT_TIMEOUT_MS = 3000;

type UpdateCheckOptions = {
  currentVersion: string;
  logger: BelldandyLogger;
  enabled?: boolean;
  timeoutMs?: number;
  releasesApiUrl?: string;
};

type ReleaseApiResponse = {
  tag_name?: unknown;
  html_url?: unknown;
};

type SemVerTuple = [major: number, minor: number, patch: number];

function parseSemVer(value: string): SemVerTuple | null {
  const normalized = value.trim().replace(/^v/i, "");
  const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(normalized);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareSemVer(a: SemVerTuple, b: SemVerTuple): number {
  if (a[0] !== b[0]) return a[0] - b[0];
  if (a[1] !== b[1]) return a[1] - b[1];
  return a[2] - b[2];
}

function normalizeTagToVersion(tagName: string): string | null {
  const semver = parseSemVer(tagName);
  if (!semver) return null;
  return `${semver[0]}.${semver[1]}.${semver[2]}`;
}

export async function checkForUpdates(options: UpdateCheckOptions): Promise<void> {
  if (options.enabled === false) return;

  const current = parseSemVer(options.currentVersion);
  if (!current) {
    options.logger.warn("update", `Skip update check: invalid current version "${options.currentVersion}"`);
    return;
  }

  const releasesApiUrl = options.releasesApiUrl ?? DEFAULT_RELEASES_API_URL;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(releasesApiUrl, {
      method: "GET",
      headers: {
        "Accept": "application/vnd.github+json",
        "User-Agent": "Belldandy-UpdateChecker",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      options.logger.warn("update", `Update check failed: HTTP ${response.status}`);
      return;
    }

    const payload = await response.json() as ReleaseApiResponse;
    const tagName = typeof payload.tag_name === "string" ? payload.tag_name : "";
    const latestVersion = normalizeTagToVersion(tagName);
    if (!latestVersion) return;

    const latest = parseSemVer(latestVersion);
    if (!latest) return;

    if (compareSemVer(latest, current) > 0) {
      const releaseUrl = typeof payload.html_url === "string" && payload.html_url.trim()
        ? payload.html_url.trim()
        : `https://github.com/vrboyzero/star-sanctuary/releases/tag/v${latestVersion}`;
      options.logger.info("update", `New version available: v${latestVersion} (current: v${options.currentVersion})`);
      options.logger.info("update", `Upgrade: ${releaseUrl}`);
    }
  } catch (error) {
    if ((error as { name?: string }).name === "AbortError") {
      options.logger.warn("update", `Update check timeout after ${timeoutMs}ms`);
      return;
    }
    options.logger.warn("update", `Update check error: ${String(error)}`);
  } finally {
    clearTimeout(timer);
  }
}


