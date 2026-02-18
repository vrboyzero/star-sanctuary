import type { Tool } from "@belldandy/skills";
import type { AgentHooks } from "@belldandy/agent";
export declare class PluginRegistry {
    private plugins;
    private tools;
    private hooksList;
    /** pluginId → 该插件注册的工具名列表 */
    private pluginToolMap;
    /** pluginId → 该插件声明的 skill 目录 */
    private pluginSkillDirs;
    /**
     * Load a plugin from a file path.
     * The file must default export an object implementing BelldandyPlugin.
     */
    loadPlugin(filePath: string): Promise<void>;
    /**
     * Load all plugins from a directory (non-recursive)
     */
    loadPluginDirectory(dirPath: string): Promise<void>;
    /**
     * Get all registered tools
     */
    getAllTools(): Tool[];
    /**
     * Get all loaded plugin IDs
     */
    getPluginIds(): string[];
    /**
     * Get plugin → tool names mapping (for tools-config integration)
     */
    getPluginToolMap(): Map<string, string[]>;
    /**
     * Get plugin → skill directory mapping (for SkillRegistry integration)
     */
    getPluginSkillDirs(): Map<string, string>;
    /**
     * Get aggregated hooks to pass to the Agent
     */
    getAggregatedHooks(): AgentHooks;
}
//# sourceMappingURL=registry.d.ts.map