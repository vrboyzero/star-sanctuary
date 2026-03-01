import { loadChannelRouterConfig } from "./config.js";
import { createDisabledRouter, createRuleBasedRouter } from "./engine.js";
import type { ChannelRouter, ChannelRouterLogger } from "./types.js";

export type CreateChannelRouterOptions = {
  enabled?: boolean;
  configPath?: string;
  defaultAgentId?: string;
  logger?: ChannelRouterLogger;
};

export function createChannelRouter(options: CreateChannelRouterOptions = {}): ChannelRouter {
  if (!options.enabled) {
    options.logger?.info?.("channel router disabled");
    return createDisabledRouter(options.defaultAgentId);
  }

  const config = loadChannelRouterConfig(options.configPath, options.logger);
  return createRuleBasedRouter(config, {
    defaultAgentId: options.defaultAgentId,
    defaultAllow: true,
    logger: options.logger,
  });
}

export * from "./types.js";
export * from "./engine.js";
export * from "./config.js";

