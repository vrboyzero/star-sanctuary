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
  resolveEnvLocalPath,
  updateEnvValue,
} from "../shared/env-loader.js";
import type { OnboardAnswers } from "../wizard/onboard.js";

/** Map OnboardAnswers to env key-value pairs. */
function answersToEnvPairs(a: OnboardAnswers): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];

  pairs.push(["BELLDANDY_AGENT_PROVIDER", a.provider]);

  if (a.provider === "openai") {
    if (a.baseUrl) pairs.push(["BELLDANDY_OPENAI_BASE_URL", a.baseUrl]);
    if (a.apiKey) pairs.push(["BELLDANDY_OPENAI_API_KEY", a.apiKey]);
    if (a.model) pairs.push(["BELLDANDY_OPENAI_MODEL", a.model]);
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

function hasNonInteractiveFlags(args: Record<string, unknown>): boolean {
  return !!(args.provider);
}

function buildAnswersFromFlags(args: Record<string, unknown>): OnboardAnswers {
  const provider = (args.provider as string) === "openai" ? "openai" : "mock";
  const host = (args.host as string) ?? "127.0.0.1";
  const port = args.port ? Number(args.port) : 28889;
  const authMode = (args["auth-mode"] as string) ?? "none";

  return {
    provider,
    baseUrl: args["base-url"] as string | undefined,
    apiKey: args["api-key"] as string | undefined,
    model: args.model as string | undefined,
    host,
    port,
    authMode: authMode as OnboardAnswers["authMode"],
    authSecret: (args["auth-secret"] as string) ?? undefined,
  };
}

export default defineCommand({
  meta: { name: "setup", description: "Interactive setup wizard (or non-interactive with flags)" },
  args: {
    json: { type: "boolean", description: "JSON output" },
    "state-dir": { type: "string", description: "Override state directory" },
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
    const envPath = resolveEnvLocalPath();

    let answers: OnboardAnswers;

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
      if (answers.host === "0.0.0.0" && answers.authMode === "none") {
        const msg = "LAN access (0.0.0.0) requires auth-mode token or password";
        if (ctx.json) ctx.output({ error: msg });
        else ctx.error(msg);
        process.exit(1);
      }
    } else {
      // Interactive mode
      const { runOnboardWizard } = await import("../wizard/onboard.js");
      const result = await runOnboardWizard();
      if (!result) {
        process.exit(0);
      }
      answers = result;
    }

    // Write to .env.local
    const pairs = answersToEnvPairs(answers);
    for (const [key, value] of pairs) {
      updateEnvValue(envPath, key, value);
    }

    if (ctx.json) {
      const written: Record<string, string> = {};
      for (const [k, v] of pairs) {
        // Redact secrets in JSON output
        written[k] = /KEY|SECRET|TOKEN|PASSWORD/i.test(k)
          ? "***"
          : v;
      }
      ctx.output({ path: envPath, config: written });
    } else {
      const existedBefore = fs.existsSync(envPath);
      console.log(pc.green(`\n✓ Configuration saved to ${envPath}`));
      console.log(`  ${pairs.length} value(s) written.\n`);
      if (!existedBefore) {
        console.log(pc.dim("  Run 'bdd doctor' to verify your setup."));
        console.log(pc.dim("  Run 'bdd start' to launch Belldandy.\n"));
      }
    }
  },
});
