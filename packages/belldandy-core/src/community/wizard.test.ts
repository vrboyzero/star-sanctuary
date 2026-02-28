import { beforeEach, describe, expect, it, vi } from "vitest";
import { runCommunityWizard } from "./wizard.js";

type RoomInfo = { name: string; password?: string };
type AgentConfig = { name: string; apiKey: string; room?: RoomInfo };
type CommunityConfig = {
  endpoint: string;
  agents: AgentConfig[];
  reconnect?: { enabled: boolean; maxRetries: number; backoffMs: number };
};

const readlineState = vi.hoisted(() => ({
  answers: [] as string[],
  prompts: [] as string[],
  close: vi.fn(),
}));

const channelsState = vi.hoisted(() => ({
  config: {
    endpoint: "https://office.goddess.ai",
    agents: [],
    reconnect: { enabled: true, maxRetries: 10, backoffMs: 5000 },
  } as CommunityConfig,
  loadCommunityConfig: vi.fn(),
  saveCommunityConfig: vi.fn(),
  addAgentConfig: vi.fn(),
  removeAgentConfig: vi.fn(),
  listAgentConfigs: vi.fn(),
  getCommunityConfigPath: vi.fn(),
}));

function cloneConfig(config: CommunityConfig): CommunityConfig {
  return {
    ...config,
    agents: config.agents.map((agent) => ({ ...agent, room: agent.room ? { ...agent.room } : undefined })),
    reconnect: config.reconnect ? { ...config.reconnect } : undefined,
  };
}

vi.mock("node:readline", () => ({
  default: {
    createInterface: vi.fn(() => ({
      question: (prompt: string, cb: (answer: string) => void) => {
        readlineState.prompts.push(prompt);
        const next = readlineState.answers.shift();
        if (next === undefined) {
          throw new Error(`No mocked answer for prompt: ${prompt}`);
        }
        cb(next);
      },
      close: readlineState.close,
    })),
  },
}));

vi.mock("@belldandy/channels", () => ({
  loadCommunityConfig: channelsState.loadCommunityConfig,
  saveCommunityConfig: channelsState.saveCommunityConfig,
  addAgentConfig: channelsState.addAgentConfig,
  removeAgentConfig: channelsState.removeAgentConfig,
  listAgentConfigs: channelsState.listAgentConfigs,
  getCommunityConfigPath: channelsState.getCommunityConfigPath,
}));

describe("community wizard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readlineState.answers = [];
    readlineState.prompts = [];
    channelsState.config = {
      endpoint: "https://office.goddess.ai",
      agents: [],
      reconnect: { enabled: true, maxRetries: 10, backoffMs: 5000 },
    };

    channelsState.getCommunityConfigPath.mockReturnValue("/mock/.belldandy/community.json");
    channelsState.loadCommunityConfig.mockImplementation(() => cloneConfig(channelsState.config));
    channelsState.listAgentConfigs.mockImplementation(() => channelsState.config.agents.map((a) => ({ ...a })));
    channelsState.saveCommunityConfig.mockImplementation((config: CommunityConfig) => {
      channelsState.config = cloneConfig(config);
    });
    channelsState.addAgentConfig.mockImplementation((agentConfig: AgentConfig) => {
      const idx = channelsState.config.agents.findIndex((a) => a.name === agentConfig.name);
      if (idx >= 0) {
        channelsState.config.agents[idx] = { ...agentConfig };
      } else {
        channelsState.config.agents.push({ ...agentConfig });
      }
    });
    channelsState.removeAgentConfig.mockImplementation((agentName: string) => {
      channelsState.config.agents = channelsState.config.agents.filter((a) => a.name !== agentName);
    });
  });

  it("should show menu and exit when choosing option 5", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    readlineState.answers.push("5");

    await runCommunityWizard();

    expect(readlineState.prompts).toContain("\n请选择操作 (1-5): ");
    expect(readlineState.close).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith("欢迎使用 Belldandy 社区配置向导！");
    expect(logSpy).toHaveBeenCalledWith("再见！");
    logSpy.mockRestore();
  });

  it("should add an agent via input flow and persist config", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    readlineState.answers.push("1", "agent-alpha", "api-key-1", "n", "5");

    await runCommunityWizard();

    expect(channelsState.addAgentConfig).toHaveBeenCalledWith({
      name: "agent-alpha",
      apiKey: "api-key-1",
      room: undefined,
    });
    expect(channelsState.config.agents).toHaveLength(1);
    expect(channelsState.config.agents[0].name).toBe("agent-alpha");
  });

  it("should update endpoint via input flow and save config", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    readlineState.answers.push("4", "https://community.example.com", "5");

    await runCommunityWizard();

    expect(channelsState.saveCommunityConfig).toHaveBeenCalledTimes(1);
    expect(channelsState.config.endpoint).toBe("https://community.example.com");
  });
});
