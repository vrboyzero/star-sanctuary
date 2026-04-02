import type { CommandDef } from "citty";

export type CommandType = "command" | "group";

export type CommandSource =
  | "builtin"
  | "plugin"
  | "skill"
  | "workflow"
  | "internal";

export type CommandVisibility = "public" | "internal" | "hidden";

export type CommandChannel = "cli" | "web" | "browser-extension";

export type CommandSafeScope =
  | "local-safe"
  | "web-safe"
  | "bridge-safe"
  | "remote-safe"
  | "privileged";

export type CommandFeatureFlag = string | readonly string[];

type CommandModule = {
  default: CommandDef<any>;
};

type CommandHandlerResult = CommandDef<any> | CommandModule;

export type CommandHandler = () => CommandHandlerResult | Promise<CommandHandlerResult>;

export interface CommandDescriptor {
  name: string;
  type: CommandType;
  source: CommandSource;
  visibility: CommandVisibility;
  channels: readonly CommandChannel[];
  safeScopes: readonly CommandSafeScope[];
  featureFlag?: CommandFeatureFlag;
  isSensitive?: boolean;
  description?: string;
  aliases?: readonly string[];
  handler: CommandHandler;
}

export function normalizeFeatureFlags(
  featureFlag?: CommandFeatureFlag,
): readonly string[] {
  if (typeof featureFlag === "undefined") {
    return [];
  }
  return typeof featureFlag === "string" ? [featureFlag] : [...featureFlag];
}

export async function loadCommandDefinition(
  descriptor: Pick<CommandDescriptor, "handler">,
): Promise<CommandDef<any>> {
  const resolved = await descriptor.handler();

  if ("default" in resolved) {
    return resolved.default;
  }

  return resolved;
}
