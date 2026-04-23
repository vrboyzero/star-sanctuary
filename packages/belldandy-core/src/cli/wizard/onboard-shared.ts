import type { EnvEntry } from "../shared/env-loader.js";

export type SetupFlow = "quickstart" | "advanced";
export type SetupScenario = "local" | "lan" | "remote";
export type ExistingConfigAction = "reuse" | "modify" | "reset";
export type SetupAuthMode = "none" | "token" | "password";

export interface OnboardAnswers {
  flow: SetupFlow;
  scenario: SetupScenario;
  provider: "openai" | "mock";
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  host: string;
  port: number;
  authMode: SetupAuthMode;
  authSecret?: string;
}

export interface AnswersToEnvPairsOptions {
  includeModelConfig?: boolean;
}

function normalizeFlow(value: unknown): SetupFlow {
  return value === "advanced" ? "advanced" : "quickstart";
}

function normalizeAuthMode(value: unknown, fallback: SetupAuthMode = "none"): SetupAuthMode {
  if (value === "token" || value === "password" || value === "none") {
    return value;
  }
  return fallback;
}

export function isLocalHost(host?: string): boolean {
  return !host || host === "127.0.0.1" || host === "localhost";
}

export function inferScenarioFromHost(host?: string): SetupScenario {
  if (isLocalHost(host)) {
    return "local";
  }
  if (host === "0.0.0.0") {
    return "remote";
  }
  return "remote";
}

export function normalizeScenario(value: unknown, host?: string): SetupScenario {
  if (value === "local" || value === "lan" || value === "remote") {
    return value;
  }
  return inferScenarioFromHost(host);
}

export function getScenarioDefaults(scenario: SetupScenario): {
  host: string;
  authMode: SetupAuthMode;
} {
  if (scenario === "local") {
    return { host: "127.0.0.1", authMode: "none" };
  }
  return { host: "0.0.0.0", authMode: "token" };
}

export function parseExistingAnswers(entries: EnvEntry[]): OnboardAnswers | null {
  if (entries.length === 0) return null;

  const values = new Map(entries.map((entry) => [entry.key, entry.value]));
  const provider = values.get("BELLDANDY_AGENT_PROVIDER") === "openai" ? "openai" : "mock";
  const host = values.get("BELLDANDY_HOST") ?? "127.0.0.1";
  const portValue = Number(values.get("BELLDANDY_PORT") ?? "28889");
  const port = Number.isFinite(portValue) && portValue >= 1 && portValue <= 65535 ? portValue : 28889;
  const scenario = normalizeScenario(undefined, host);
  const authMode = normalizeAuthMode(values.get("BELLDANDY_AUTH_MODE"), getScenarioDefaults(scenario).authMode);

  return {
    flow: "advanced",
    scenario,
    provider,
    baseUrl: values.get("BELLDANDY_OPENAI_BASE_URL") ?? undefined,
    apiKey: values.get("BELLDANDY_OPENAI_API_KEY") ?? undefined,
    model: values.get("BELLDANDY_OPENAI_MODEL") ?? undefined,
    host,
    port,
    authMode,
    authSecret: authMode === "token"
      ? values.get("BELLDANDY_AUTH_TOKEN") ?? undefined
      : authMode === "password"
        ? values.get("BELLDANDY_AUTH_PASSWORD") ?? undefined
        : undefined,
  };
}

export function answersToEnvPairs(
  a: OnboardAnswers,
  options: AnswersToEnvPairsOptions = {},
): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  const includeModelConfig = options.includeModelConfig ?? true;

  if (includeModelConfig) {
    pairs.push(["BELLDANDY_AGENT_PROVIDER", a.provider]);

    if (a.provider === "openai") {
      if (a.baseUrl) pairs.push(["BELLDANDY_OPENAI_BASE_URL", a.baseUrl]);
      if (a.apiKey) pairs.push(["BELLDANDY_OPENAI_API_KEY", a.apiKey]);
      if (a.model) pairs.push(["BELLDANDY_OPENAI_MODEL", a.model]);
    }
  }

  if (a.host !== "127.0.0.1") pairs.push(["BELLDANDY_HOST", a.host]);
  if (a.port !== 28889) pairs.push(["BELLDANDY_PORT", String(a.port)]);

  pairs.push(["BELLDANDY_AUTH_MODE", a.authMode]);
  if (a.authMode === "token" && a.authSecret) {
    pairs.push(["BELLDANDY_AUTH_TOKEN", a.authSecret]);
  } else if (a.authMode === "password" && a.authSecret) {
    pairs.push(["BELLDANDY_AUTH_PASSWORD", a.authSecret]);
  }

  return pairs;
}

export function buildAnswersFromFlags(args: Record<string, unknown>): OnboardAnswers {
  const provider = args.provider === "openai" ? "openai" : "mock";
  const flow = normalizeFlow(args.flow);
  const explicitHost = typeof args.host === "string" ? args.host : undefined;
  const scenario = normalizeScenario(args.scenario, explicitHost);
  const scenarioDefaults = getScenarioDefaults(scenario);
  const host = explicitHost ?? scenarioDefaults.host;
  const port = args.port ? Number(args.port) : 28889;
  const authMode = normalizeAuthMode(args["auth-mode"], scenarioDefaults.authMode);

  return {
    flow,
    scenario,
    provider,
    baseUrl: args["base-url"] as string | undefined,
    apiKey: args["api-key"] as string | undefined,
    model: args.model as string | undefined,
    host,
    port,
    authMode,
    authSecret: (args["auth-secret"] as string) ?? undefined,
  };
}
