import { describe, expect, test } from "vitest";

import {
  answersToEnvPairs,
  buildAnswersFromFlags,
  getScenarioDefaults,
  isLocalHost,
  parseExistingAnswers,
} from "./onboard-shared.js";

describe("onboard-shared", () => {
  test("parseExistingAnswers returns advanced answers from env entries", () => {
    const answers = parseExistingAnswers([
      { key: "BELLDANDY_AGENT_PROVIDER", value: "openai" },
      { key: "BELLDANDY_OPENAI_BASE_URL", value: "https://api.openai.com/v1" },
      { key: "BELLDANDY_OPENAI_API_KEY", value: "sk-test" },
      { key: "BELLDANDY_OPENAI_MODEL", value: "gpt-4o" },
      { key: "BELLDANDY_HOST", value: "0.0.0.0" },
      { key: "BELLDANDY_PORT", value: "3000" },
      { key: "BELLDANDY_AUTH_MODE", value: "token" },
      { key: "BELLDANDY_AUTH_TOKEN", value: "secret-token" },
    ]);

    expect(answers).toEqual({
      flow: "advanced",
      scenario: "remote",
      provider: "openai",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk-test",
      model: "gpt-4o",
      host: "0.0.0.0",
      port: 3000,
      authMode: "token",
      authSecret: "secret-token",
    });
  });

  test("buildAnswersFromFlags applies scenario defaults", () => {
    const answers = buildAnswersFromFlags({
      provider: "openai",
      flow: "quickstart",
      scenario: "remote",
      "base-url": "https://api.openai.com/v1",
      "api-key": "sk-live",
      model: "gpt-4.1",
    });

    expect(answers.flow).toBe("quickstart");
    expect(answers.scenario).toBe("remote");
    expect(answers.host).toBe("0.0.0.0");
    expect(answers.authMode).toBe("token");
  });

  test("parseExistingAnswers treats localhost as local", () => {
    const answers = parseExistingAnswers([
      { key: "BELLDANDY_AGENT_PROVIDER", value: "mock" },
      { key: "BELLDANDY_HOST", value: "localhost" },
    ]);

    expect(answers?.scenario).toBe("local");
    expect(answers?.authMode).toBe("none");
  });

  test("answersToEnvPairs writes auth token for token mode", () => {
    const pairs = answersToEnvPairs({
      flow: "advanced",
      scenario: "lan",
      provider: "mock",
      host: "0.0.0.0",
      port: 28889,
      authMode: "token",
      authSecret: "abc123",
    });

    expect(pairs).toContainEqual(["BELLDANDY_AUTH_MODE", "token"]);
    expect(pairs).toContainEqual(["BELLDANDY_AUTH_TOKEN", "abc123"]);
  });

  test("getScenarioDefaults keeps local installs private by default", () => {
    expect(getScenarioDefaults("local")).toEqual({
      host: "127.0.0.1",
      authMode: "none",
    });
  });

  test("isLocalHost recognizes local bind addresses", () => {
    expect(isLocalHost(undefined)).toBe(true);
    expect(isLocalHost("127.0.0.1")).toBe(true);
    expect(isLocalHost("localhost")).toBe(true);
    expect(isLocalHost("0.0.0.0")).toBe(false);
  });
});
