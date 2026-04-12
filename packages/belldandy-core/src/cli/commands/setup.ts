/**
 * bdd setup — Onboarding Wizard (interactive) + non-interactive mode via CLI flags.
 *
 * Interactive:  bdd setup
 * Non-interactive: bdd setup --provider openai --base-url ... --api-key ... --model ...
 */
import { defineCommand } from "citty";
import fs from "node:fs";
import pc from "picocolors";
import { createCLIContext } from "../shared/context.js";
import {
  parseEnvFile,
  removeEnvValue,
  resolveEnvPath,
  resolveEnvLocalPath,
  updateEnvValue,
} from "../shared/env-loader.js";
import type { OnboardAnswers, SetupFlow, SetupScenario } from "../wizard/onboard-shared.js";
import { answersToEnvPairs, buildAnswersFromFlags, isLocalHost } from "../wizard/onboard-shared.js";
import type { AdvancedModule } from "../wizard/advanced-modules-shared.js";

const NON_INTERACTIVE_INPUT_KEYS = [
  "provider",
  "base-url",
  "api-key",
  "model",
  "host",
  "port",
  "auth-mode",
  "auth-secret",
] as const;

const MANAGED_ENV_KEYS = [
  "BELLDANDY_AGENT_PROVIDER",
  "BELLDANDY_OPENAI_BASE_URL",
  "BELLDANDY_OPENAI_API_KEY",
  "BELLDANDY_OPENAI_MODEL",
  "BELLDANDY_HOST",
  "BELLDANDY_PORT",
  "BELLDANDY_AUTH_MODE",
  "BELLDANDY_AUTH_TOKEN",
  "BELLDANDY_AUTH_PASSWORD",
] as const;

function hasNonInteractiveFlags(args: Record<string, unknown>): boolean {
  return NON_INTERACTIVE_INPUT_KEYS.some((key) => {
    const value = args[key];
    return value !== undefined && value !== false && value !== "";
  });
}

function readMergedEnvValues(envPath: string, envLocalPath: string): Map<string, string> {
  const merged = new Map<string, string>();
  for (const entry of parseEnvFile(envPath)) {
    merged.set(entry.key, entry.value);
  }
  for (const entry of parseEnvFile(envLocalPath)) {
    merged.set(entry.key, entry.value);
  }
  return merged;
}

export function reconcileSetupCommunityApiConflict(params: {
  envPath: string;
  envLocalPath: string;
  authMode: OnboardAnswers["authMode"];
}): string[] {
  if (params.authMode !== "none") {
    return [];
  }

  const mergedValues = readMergedEnvValues(params.envPath, params.envLocalPath);
  const communityApiEnabled = String(mergedValues.get("BELLDANDY_COMMUNITY_API_ENABLED") ?? "false")
    .trim()
    .toLowerCase() === "true";
  if (!communityApiEnabled) {
    return [];
  }

  updateEnvValue(params.envLocalPath, "BELLDANDY_COMMUNITY_API_ENABLED", "false");
  removeEnvValue(params.envLocalPath, "BELLDANDY_COMMUNITY_API_TOKEN");
  return [
    "Detected AUTH_MODE=none during setup; disabled Community HTTP API in .env.local to avoid an invalid auth/community combination.",
  ];
}

export default defineCommand({
  meta: { name: "setup", description: "Interactive setup wizard (or non-interactive with flags)" },
  args: {
    json: { type: "boolean", description: "JSON output" },
    "state-dir": { type: "string", description: "Override state directory" },
    flow: { type: "string", description: "Setup flow: quickstart | advanced" },
    scenario: { type: "string", description: "Run scenario: local | lan | remote" },
    // Non-interactive flags
    provider: { type: "string", description: "Agent provider: openai | mock" },
    "base-url": { type: "string", description: "OpenAI-compatible API base URL" },
    "api-key": { type: "string", description: "API key" },
    model: { type: "string", description: "Model name" },
    host: { type: "string", description: "Bind address (default: 127.0.0.1)" },
    port: { type: "string", description: "Port (default: 28889)" },
    "auth-mode": { type: "string", description: "Auth mode: none | token | password" },
    "auth-secret": { type: "string", description: "Auth token or password" },
  },
  async run({ args }) {
    const ctx = createCLIContext({ json: args.json, stateDir: args["state-dir"] });
    const projectEnvPath = resolveEnvPath(ctx.envDir);
    const envPath = resolveEnvLocalPath(ctx.envDir);

    let answers: OnboardAnswers;
    let configuredModules: AdvancedModule[] = [];
    let moduleNotes: string[] = [];

    if (hasNonInteractiveFlags(args)) {
      // Non-interactive mode
      answers = buildAnswersFromFlags(args);

      // Validate required fields for openai provider
      if (answers.provider === "openai") {
        const missing: string[] = [];
        if (!answers.baseUrl) missing.push("--base-url");
        if (!answers.apiKey) missing.push("--api-key");
        if (!answers.model) missing.push("--model");
        if (missing.length > 0) {
          const msg = `OpenAI provider requires: ${missing.join(", ")}`;
          if (ctx.json) ctx.output({ error: msg });
          else ctx.error(msg);
          process.exit(1);
        }
      }

      // Validate LAN + auth
      if (!isLocalHost(answers.host) && answers.authMode === "none") {
        const msg = "Non-local access requires auth-mode token or password";
        if (ctx.json) ctx.output({ error: msg });
        else ctx.error(msg);
        process.exit(1);
      }
    } else {
      // Interactive mode
      const { runOnboardWizard } = await import("../wizard/onboard.js");
      const result = await runOnboardWizard({
        envPath,
        flow: (args.flow as SetupFlow | undefined),
        scenario: (args.scenario as SetupScenario | undefined),
      });
      if (!result) {
        process.exit(0);
      }
      answers = result;
    }

    // Write to .env.local
    const existedBefore = fs.existsSync(envPath);
    const setupNotes = reconcileSetupCommunityApiConflict({
      envPath: projectEnvPath,
      envLocalPath: envPath,
      authMode: answers.authMode,
    });
    const pairs = answersToEnvPairs(answers);
    const nextKeys = new Set(pairs.map(([key]) => key));
    for (const key of MANAGED_ENV_KEYS) {
      if (!nextKeys.has(key)) {
        removeEnvValue(envPath, key);
      }
    }
    for (const [key, value] of pairs) {
      updateEnvValue(envPath, key, value);
    }

    if (!hasNonInteractiveFlags(args) && answers.flow === "advanced") {
      const { runAdvancedModulesWizard } = await import("../wizard/advanced-modules.js");
      const advancedResult = await runAdvancedModulesWizard({
        envPath,
        stateDir: ctx.stateDir,
        authMode: answers.authMode,
      });
      configuredModules = advancedResult.configuredModules;
      moduleNotes = advancedResult.notes;
    }

    if (ctx.json) {
      const written: Record<string, string> = {};
      for (const [k, v] of pairs) {
        // Redact secrets in JSON output
        written[k] = /KEY|SECRET|TOKEN|PASSWORD/i.test(k)
          ? "***"
          : v;
      }
      ctx.output({
        path: envPath,
        flow: answers.flow,
        scenario: answers.scenario,
        configuredModules,
        notes: [...setupNotes, ...moduleNotes],
        config: written,
      });
    } else {
      console.log(pc.green(`\n✓ Configuration saved to ${envPath}`));
      console.log(`  ${pairs.length} value(s) written.\n`);
      console.log(pc.dim(`  Flow: ${answers.flow}`));
      console.log(pc.dim(`  Scenario: ${answers.scenario}`));
      console.log(pc.dim(`  Bind: ${answers.host}:${answers.port}`));
      console.log(pc.dim(`  Auth: ${answers.authMode}\n`));
      if (configuredModules.length > 0) {
        console.log(pc.dim(`  Advanced modules: ${configuredModules.join(", ")}\n`));
      }
      for (const note of setupNotes) {
        console.log(pc.dim(`  ${note}`));
      }
      for (const note of moduleNotes) {
        console.log(pc.dim(`  ${note}`));
      }
      if (setupNotes.length > 0 || moduleNotes.length > 0) {
        console.log("");
      }
      if (!existedBefore) {
        console.log(pc.dim("  Run 'bdd doctor' to verify your setup."));
        console.log(pc.dim("  Run 'bdd start' to launch Belldandy.\n"));
      } else {
        console.log(pc.dim("  Run 'bdd doctor' to verify the updated setup."));
        console.log(pc.dim("  Run 'bdd start' to relaunch Belldandy with the new config.\n"));
      }
    }
  },
});
