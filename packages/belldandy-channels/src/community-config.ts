import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { CommunityAgentConfig } from "./community.js";

/**
 * 社区配置文件结构
 */
export interface CommunityConfig {
  /** 社区服务端点 */
  endpoint: string;
  /** Agent 配置列表 */
  agents: CommunityAgentConfig[];
  /** 重连配置 */
  reconnect?: {
    enabled: boolean;
    maxRetries: number;
    backoffMs: number;
  };
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: CommunityConfig = {
  endpoint: "https://office.goddess.ai",
  agents: [],
  reconnect: {
    enabled: true,
    maxRetries: 10,
    backoffMs: 5000,
  },
};

/**
 * 获取配置文件路径
 */
export function getCommunityConfigPath(): string {
  const homeDir = os.homedir();
  const belldandyDir = path.join(homeDir, ".belldandy");
  return path.join(belldandyDir, "community.json");
}

/**
 * 确保配置目录存在
 */
function ensureConfigDir(): void {
  const configPath = getCommunityConfigPath();
  const configDir = path.dirname(configPath);

  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
}

/**
 * 加载社区配置
 */
export function loadCommunityConfig(): CommunityConfig {
  const configPath = getCommunityConfigPath();

  if (!fs.existsSync(configPath)) {
    console.log(`[Community] Config file not found at ${configPath}, using defaults`);
    return DEFAULT_CONFIG;
  }

  try {
    const content = fs.readFileSync(configPath, "utf-8");
    const config = JSON.parse(content) as CommunityConfig;

    // 合并默认配置
    return {
      ...DEFAULT_CONFIG,
      ...config,
      reconnect: {
        enabled: config.reconnect?.enabled ?? DEFAULT_CONFIG.reconnect!.enabled,
        maxRetries: config.reconnect?.maxRetries ?? DEFAULT_CONFIG.reconnect!.maxRetries,
        backoffMs: config.reconnect?.backoffMs ?? DEFAULT_CONFIG.reconnect!.backoffMs,
      },
    };
  } catch (error) {
    console.error(`[Community] Failed to load config from ${configPath}:`, error);
    return DEFAULT_CONFIG;
  }
}

/**
 * 保存社区配置
 */
export function saveCommunityConfig(config: CommunityConfig): void {
  ensureConfigDir();
  const configPath = getCommunityConfigPath();

  try {
    const content = JSON.stringify(config, null, 2);
    fs.writeFileSync(configPath, content, "utf-8");
    console.log(`[Community] Config saved to ${configPath}`);
  } catch (error) {
    console.error(`[Community] Failed to save config to ${configPath}:`, error);
    throw error;
  }
}

/**
 * 添加 Agent 配置
 */
export function addAgentConfig(agentConfig: CommunityAgentConfig): void {
  const config = loadCommunityConfig();

  // 检查是否已存在
  const existingIndex = config.agents.findIndex(a => a.name === agentConfig.name);
  if (existingIndex >= 0) {
    // 更新现有配置
    config.agents[existingIndex] = agentConfig;
    console.log(`[Community] Updated agent config: ${agentConfig.name}`);
  } else {
    // 添加新配置
    config.agents.push(agentConfig);
    console.log(`[Community] Added agent config: ${agentConfig.name}`);
  }

  saveCommunityConfig(config);
}

/**
 * 移除 Agent 配置
 */
export function removeAgentConfig(agentName: string): void {
  const config = loadCommunityConfig();
  const originalLength = config.agents.length;

  config.agents = config.agents.filter(a => a.name !== agentName);

  if (config.agents.length < originalLength) {
    saveCommunityConfig(config);
    console.log(`[Community] Removed agent config: ${agentName}`);
  } else {
    console.log(`[Community] Agent config not found: ${agentName}`);
  }
}

/**
 * 列出所有 Agent 配置
 */
export function listAgentConfigs(): CommunityAgentConfig[] {
  const config = loadCommunityConfig();
  return config.agents;
}

/**
 * 获取指定 Agent 配置
 */
export function getAgentConfig(agentName: string): CommunityAgentConfig | undefined {
  const config = loadCommunityConfig();
  return config.agents.find(a => a.name === agentName);
}

/**
 * 更新 Agent 的房间配置
 */
export function updateAgentRoom(
  agentName: string,
  room: { name: string; password?: string } | undefined
): void {
  const config = loadCommunityConfig();
  const agent = config.agents.find(a => a.name === agentName);

  if (!agent) {
    throw new Error(`Agent not found: ${agentName}`);
  }

  agent.room = room;
  saveCommunityConfig(config);
  console.log(`[Community] Updated room for agent ${agentName}:`, room?.name || "none");
}
