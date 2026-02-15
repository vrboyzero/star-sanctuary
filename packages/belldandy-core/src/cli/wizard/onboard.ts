/**
 * Onboarding Wizard — interactive setup flow for Belldandy.
 * Collects provider, API config, host/port, and auth mode.
 * Writes results to .env.local via updateEnvValue.
 */
import * as p from "@clack/prompts";
import pc from "picocolors";

export interface OnboardAnswers {
  provider: "openai" | "mock";
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  host: string;
  port: number;
  authMode: "none" | "token" | "password";
  authSecret?: string;
}

export async function runOnboardWizard(): Promise<OnboardAnswers | null> {
  p.intro(pc.cyan("Belldandy Setup"));

  const answers = await p.group(
    {
      provider: () =>
        p.select({
          message: "Agent provider",
          options: [
            { value: "openai" as const, label: "OpenAI-compatible API" },
            { value: "mock" as const, label: "Mock (testing)" },
          ],
        }),

      baseUrl: ({ results }) => {
        if (results.provider !== "openai") return Promise.resolve(undefined);
        return p.text({
          message: "API Base URL",
          placeholder: "https://api.openai.com/v1",
          validate: (v) => (!v.trim() ? "URL is required" : undefined),
        });
      },

      apiKey: ({ results }) => {
        if (results.provider !== "openai") return Promise.resolve(undefined);
        return p.password({
          message: "API Key",
          validate: (v) => (!v.trim() ? "API Key is required" : undefined),
        });
      },

      model: ({ results }) => {
        if (results.provider !== "openai") return Promise.resolve(undefined);
        return p.text({
          message: "Model name",
          placeholder: "gpt-4o",
          validate: (v) => (!v.trim() ? "Model name is required" : undefined),
        });
      },

      host: () =>
        p.select({
          message: "Bind address",
          options: [
            { value: "127.0.0.1", label: "Localhost only (127.0.0.1)" },
            { value: "0.0.0.0", label: "LAN access (0.0.0.0)" },
          ],
        }),

      port: () =>
        p.text({
          message: "Port",
          placeholder: "28889",
          defaultValue: "28889",
          validate: (v) => {
            const n = Number(v);
            if (isNaN(n) || n < 1 || n > 65535) return "Must be a valid port (1-65535)";
            return undefined;
          },
        }),

      authMode: ({ results }) => {
        if (results.host === "0.0.0.0") {
          return p.select({
            message: "Auth mode (required for LAN access)",
            options: [
              { value: "token" as const, label: "Token" },
              { value: "password" as const, label: "Password" },
            ],
          });
        }
        return p.select({
          message: "Auth mode",
          options: [
            { value: "none" as const, label: "None" },
            { value: "token" as const, label: "Token" },
            { value: "password" as const, label: "Password" },
          ],
        });
      },

      authSecret: ({ results }) => {
        if (results.authMode === "none") return Promise.resolve(undefined);
        const label = results.authMode === "token" ? "Auth token" : "Auth password";
        return p.password({
          message: label,
          validate: (v) => (!v.trim() ? `${label} is required` : undefined),
        });
      },
    },
    {
      onCancel: () => {
        p.cancel("Setup cancelled.");
        process.exit(0);
      },
    },
  );

  return {
    provider: answers.provider as OnboardAnswers["provider"],
    baseUrl: (answers.baseUrl as string | undefined) ?? undefined,
    apiKey: (answers.apiKey as string | undefined) ?? undefined,
    model: (answers.model as string | undefined) ?? undefined,
    host: answers.host as string,
    port: Number(answers.port) || 28889,
    authMode: answers.authMode as OnboardAnswers["authMode"],
    authSecret: (answers.authSecret as string | undefined) ?? undefined,
  };
}
