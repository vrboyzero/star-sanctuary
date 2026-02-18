import type { Tool } from "@belldandy/skills";
import type { AgentHooks } from "@belldandy/agent";

export interface PluginContext {
    /** Register a tool provided by this plugin */
    registerTool(tool: Tool): void;
    /** Register hooks provided by this plugin */
    registerHooks(hooks: AgentHooks): void;
    /** Register a directory containing SKILL.md sub-directories */
    registerSkillDir(dir: string): void;
}

export interface BelldandyPlugin {
    id: string;
    name: string;
    version?: string;
    description?: string;
    /**
     * Activation hook called when the plugin is loaded.
     * Use this to register tools and hooks.
     */
    activate(context: PluginContext): void | Promise<void>;
}
