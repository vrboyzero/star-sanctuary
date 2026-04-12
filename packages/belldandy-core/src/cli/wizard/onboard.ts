/**
 * Onboarding Wizard — interactive setup flow for Belldandy.
 * Collects provider, API config, host/port, and auth mode.
 * Writes results to .env.local via updateEnvValue.
 */
import * as p from "@clack/prompts";
import pc from "picocolors";
import { parseEnvFile } from "../shared/env-loader.js";
import {
  getScenarioDefaults,
  isLocalHost,
  normalizeScenario,
  parseExistingAnswers,
  type ExistingConfigAction,
  type OnboardAnswers,
  type SetupAuthMode,
  type SetupFlow,
  type SetupScenario,
} from "./onboard-shared.js";

export type RunOnboardWizardOptions = {
  envPath?: string;
  flow?: SetupFlow;
  scenario?: SetupScenario;
};

function resolvePromptValue<T>(value: T | symbol): T {
  if (p.isCancel(value)) {
    p.cancel("Setup cancelled.");
    process.exit(0);
  }
  return value;
}

async function promptSecret(message: string, existingValue?: string): Promise<string> {
  if (existingValue) {
    const keepExisting = resolvePromptValue(await p.confirm({
      message: `Keep existing ${message}?`,
      initialValue: true,
      active: "Keep",
      inactive: "Re-enter",
    }));
    if (keepExisting) return existingValue;
  }

  return resolvePromptValue(await p.password({
    message,
    validate: (value) => (!value.trim() ? `${message} is required` : undefined),
  }));
}

function renderSummary(answers: OnboardAnswers): string {
  return [
    `Flow: ${answers.flow}`,
    `Scenario: ${answers.scenario}`,
    `Provider: ${answers.provider}`,
    `Host: ${answers.host}:${answers.port}`,
    `Auth: ${answers.authMode}`,
  ].join("\n");
}

function getAuthInitialValue(
  host: string,
  currentAuthMode: SetupAuthMode | undefined,
  fallback: SetupAuthMode,
): SetupAuthMode {
  if (isLocalHost(host)) {
    return currentAuthMode ?? fallback;
  }
  if (currentAuthMode === "token" || currentAuthMode === "password") {
    return currentAuthMode;
  }
  return fallback;
}

export async function runOnboardWizard(options: RunOnboardWizardOptions = {}): Promise<OnboardAnswers | null> {
  p.intro(pc.cyan("Belldandy Setup 2.0"));

  const existingAnswers = options.envPath
    ? parseExistingAnswers(parseEnvFile(options.envPath))
    : null;

  if (existingAnswers) {
    p.note(renderSummary(existingAnswers), "Existing configuration detected");
  }

  let existingAction: ExistingConfigAction = "reset";
  if (existingAnswers) {
    existingAction = resolvePromptValue(await p.select<ExistingConfigAction>({
      message: "Existing configuration found. What do you want to do?",
      options: [
        { value: "modify", label: "Modify current config", hint: "Recommended" },
        { value: "reuse", label: "Keep current config" },
        { value: "reset", label: "Reset and re-enter" },
      ],
      initialValue: "modify",
    }));
  }

  if (existingAnswers && existingAction === "reuse") {
    p.note(renderSummary(existingAnswers), "Keeping existing configuration");
    return existingAnswers;
  }

  const defaults = existingAnswers && existingAction === "modify"
    ? existingAnswers
    : undefined;

  const flow = options.flow ?? resolvePromptValue(await p.select<SetupFlow>({
    message: "Setup flow",
    options: [
      { value: "quickstart", label: "QuickStart", hint: "Fastest path to running" },
      { value: "advanced", label: "Advanced", hint: "More control and explicit choices" },
    ],
    initialValue: defaults?.flow ?? "quickstart",
  }));

  const scenario = options.scenario ?? resolvePromptValue(await p.select<SetupScenario>({
    message: "Run scenario",
    options: [
      { value: "local", label: "Local only", hint: "127.0.0.1, single-machine use" },
      { value: "lan", label: "LAN access", hint: "0.0.0.0 with required auth" },
      { value: "remote", label: "Remote / reverse proxy", hint: "0.0.0.0 with required auth" },
    ],
    initialValue: defaults?.scenario ?? "local",
  }));

  const scenarioDefaults = getScenarioDefaults(scenario);

  const provider = resolvePromptValue(await p.select<OnboardAnswers["provider"]>({
    message: "Agent provider",
    options: [
      { value: "openai", label: "OpenAI-compatible API" },
      { value: "mock", label: "Mock (testing)" },
    ],
    initialValue: defaults?.provider ?? "openai",
  }));

  let baseUrl: string | undefined;
  let apiKey: string | undefined;
  let model: string | undefined;
  if (provider === "openai") {
    baseUrl = resolvePromptValue(await p.text({
      message: "API Base URL",
      placeholder: "https://api.openai.com/v1",
      defaultValue: defaults?.baseUrl ?? "https://api.openai.com/v1",
      validate: (value) => (!value.trim() ? "URL is required" : undefined),
    }));
    apiKey = await promptSecret("API Key", defaults?.apiKey);
    model = resolvePromptValue(await p.text({
      message: "Model name",
      placeholder: "gpt-4o",
      defaultValue: defaults?.model ?? "gpt-4o",
      validate: (value) => (!value.trim() ? "Model name is required" : undefined),
    }));
  }

  const host = flow === "advanced"
    ? resolvePromptValue(await p.text({
      message: "Bind address",
      defaultValue: defaults?.host ?? scenarioDefaults.host,
      validate: (value) => (!value.trim() ? "Bind address is required" : undefined),
    }))
    : scenarioDefaults.host;

  const port = Number(resolvePromptValue(await p.text({
    message: "Port",
    placeholder: "28889",
    defaultValue: String(defaults?.port ?? 28889),
    validate: (value) => {
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || parsed < 1 || parsed > 65535) {
        return "Must be a valid port (1-65535)";
      }
      return undefined;
    },
  })));

  let authMode: SetupAuthMode;
  if (flow === "advanced") {
    const authInitialValue = getAuthInitialValue(
      host,
      defaults?.authMode,
      scenarioDefaults.authMode,
    );
    authMode = resolvePromptValue(await p.select<SetupAuthMode>({
      message: isLocalHost(host) ? "Auth mode" : "Auth mode (required for non-local access)",
      options: isLocalHost(host)
        ? [
          { value: "none", label: "None" },
          { value: "token", label: "Token" },
          { value: "password", label: "Password" },
        ]
        : [
          { value: "token", label: "Token" },
          { value: "password", label: "Password" },
        ],
      initialValue: authInitialValue,
    }));
  } else if (scenario === "local") {
    authMode = "none";
  } else {
    authMode = resolvePromptValue(await p.select<SetupAuthMode>({
      message: "Auth mode (required for non-local access)",
      options: [
        { value: "token", label: "Token" },
        { value: "password", label: "Password" },
      ],
      initialValue: defaults?.authMode === "none" ? scenarioDefaults.authMode : (defaults?.authMode ?? scenarioDefaults.authMode),
    }));
  }

  const authSecret = authMode === "none"
    ? undefined
    : await promptSecret(authMode === "token" ? "Auth token" : "Auth password", defaults?.authSecret);

  const answers: OnboardAnswers = {
    flow,
    scenario: normalizeScenario(scenario, host),
    provider,
    baseUrl,
    apiKey,
    model,
    host,
    port,
    authMode,
    authSecret,
  };

  p.note(renderSummary(answers), "Setup summary");
  return answers;
}
