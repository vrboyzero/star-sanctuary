import fs from "node:fs";
import path from "node:path";

export interface ToolsConfig {
  version: number;
  disabled: {
    builtin: string[];
    mcp_servers: string[];
    plugins: string[];
    skills: string[];
  };
}

const DEFAULT_CONFIG: ToolsConfig = {
  version: 1,
  disabled: { builtin: [], mcp_servers: [], plugins: [], skills: [] },
};

const CONFIG_FILENAME = "tools-config.json";

export class ToolsConfigManager {
  private config: ToolsConfig = structuredClone(DEFAULT_CONFIG);
  private readonly filePath: string;
  private readonly log?: { info(m: string): void; warn(m: string): void };

  /** pluginId → toolName[] 映射，由 gateway 注册 */
  private pluginToolMap = new Map<string, Set<string>>();
  /** toolName → pluginId 反向索引 */
  private toolToPlugin = new Map<string, string>();

  // 缓存 Set 以加速 isToolDisabled 查找
  private disabledBuiltin = new Set<string>();
  private disabledMCPServers = new Set<string>();
  private disabledPlugins = new Set<string>();
  private disabledSkills = new Set<string>();

  constructor(stateDir: string, logger?: { info(m: string): void; warn(m: string): void }) {
    this.filePath = path.join(stateDir, CONFIG_FILENAME);
    this.log = logger;
  }

  /** 从磁盘加载配置，文件不存在或解析失败则使用默认值 */
  async load(): Promise<void> {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, "utf-8");
        const parsed = JSON.parse(raw) as Partial<ToolsConfig>;
        this.config = {
          version: parsed.version ?? 1,
          disabled: {
            builtin: Array.isArray(parsed.disabled?.builtin) ? parsed.disabled.builtin : [],
            mcp_servers: Array.isArray(parsed.disabled?.mcp_servers) ? parsed.disabled.mcp_servers : [],
            plugins: Array.isArray(parsed.disabled?.plugins) ? parsed.disabled.plugins : [],
            skills: Array.isArray(parsed.disabled?.skills) ? parsed.disabled.skills : [],
          },
        };
        this.rebuildSets();
        this.log?.info(`tools-config loaded: ${this.disabledBuiltin.size} builtin, ${this.disabledMCPServers.size} mcp, ${this.disabledPlugins.size} plugins, ${this.disabledSkills.size} skills disabled`);
      }
    } catch (err) {
      this.log?.warn(`tools-config load failed, using defaults: ${String(err)}`);
      this.config = structuredClone(DEFAULT_CONFIG);
      this.rebuildSets();
    }
  }

  /** 原子写入配置到磁盘 */
  async save(): Promise<void> {
    const tmpPath = this.filePath + ".tmp";
    fs.writeFileSync(tmpPath, JSON.stringify(this.config, null, 2), "utf-8");
    fs.renameSync(tmpPath, this.filePath);
  }

  /** 注册 plugin 的工具映射（由 gateway 在加载 plugin 后调用） */
  registerPluginTools(pluginId: string, toolNames: string[]): void {
    this.pluginToolMap.set(pluginId, new Set(toolNames));
    for (const name of toolNames) {
      this.toolToPlugin.set(name, pluginId);
    }
  }

  /** 统一判断工具是否被禁用 */
  isToolDisabled(toolName: string): boolean {
    // 1. MCP 工具：名称格式 mcp_{serverId}_{toolName}
    if (toolName.startsWith("mcp_")) {
      const serverId = this.extractMCPServerId(toolName);
      if (serverId) return this.disabledMCPServers.has(serverId);
    }
    // 2. Plugin 工具
    const pluginId = this.toolToPlugin.get(toolName);
    if (pluginId) return this.disabledPlugins.has(pluginId);
    // 3. Builtin 工具
    return this.disabledBuiltin.has(toolName);
  }

  /** 返回当前配置（供 tools.list 使用） */
  getConfig(): ToolsConfig {
    return this.config;
  }

  /** 合并更新禁用列表并保存 */
  async updateConfig(disabled: Partial<ToolsConfig["disabled"]>): Promise<void> {
    if (disabled.builtin !== undefined) this.config.disabled.builtin = disabled.builtin;
    if (disabled.mcp_servers !== undefined) this.config.disabled.mcp_servers = disabled.mcp_servers;
    if (disabled.plugins !== undefined) this.config.disabled.plugins = disabled.plugins;
    if (disabled.skills !== undefined) this.config.disabled.skills = disabled.skills;
    this.rebuildSets();
    await this.save();
  }

  /** 从 MCP 工具名中提取 serverId */
  private extractMCPServerId(toolName: string): string | null {
    // 格式: mcp_{serverId}_{originalToolName}
    // serverId 本身不含下划线（由 MCP config 的 id 字段决定）
    // 但为安全起见，取第一个 _ 后到第二个 _ 之间的部分
    const withoutPrefix = toolName.slice(4); // 去掉 "mcp_"
    const idx = withoutPrefix.indexOf("_");
    if (idx > 0) return withoutPrefix.slice(0, idx);
    return null;
  }

  /** 查询 skill 是否被禁用 */
  isSkillDisabled(skillName: string): boolean {
    return this.disabledSkills.has(skillName);
  }

  private rebuildSets(): void {
    this.disabledBuiltin = new Set(this.config.disabled.builtin);
    this.disabledMCPServers = new Set(this.config.disabled.mcp_servers);
    this.disabledPlugins = new Set(this.config.disabled.plugins);
    this.disabledSkills = new Set(this.config.disabled.skills);
  }
}
