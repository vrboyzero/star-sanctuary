import type { SubCommandsDef } from "citty";
import { matchesSecurityMatrixSubject } from "@belldandy/skills";
import {
  loadCommandDefinition,
  normalizeFeatureFlags,
  type CommandChannel,
  type CommandDescriptor,
  type CommandSafeScope,
  type CommandSource,
  type CommandVisibility,
} from "./command-types.js";

export interface CommandRegistryFilter {
  names?: readonly string[];
  channel?: CommandChannel;
  visibility?: CommandVisibility | readonly CommandVisibility[];
  sources?: readonly CommandSource[];
  safeScopes?: readonly CommandSafeScope[];
  includeSensitive?: boolean;
  enabledFeatureFlags?: Iterable<string>;
  isFeatureEnabled?: (flag: string) => boolean;
}

function resolveVisibilityFilter(
  visibility?: CommandVisibility | readonly CommandVisibility[],
): readonly CommandVisibility[] | undefined {
  if (typeof visibility === "undefined") {
    return undefined;
  }
  return typeof visibility === "string" ? [visibility] : visibility;
}

function isFeatureFlagEnabled(
  descriptor: CommandDescriptor,
  filter: CommandRegistryFilter,
): boolean {
  const flags = normalizeFeatureFlags(descriptor.featureFlag);
  if (flags.length === 0) {
    return true;
  }

  if (filter.isFeatureEnabled) {
    return flags.every((flag) => filter.isFeatureEnabled?.(flag));
  }

  if (filter.enabledFeatureFlags) {
    const enabledFlags = new Set(filter.enabledFeatureFlags);
    return flags.every((flag) => enabledFlags.has(flag));
  }

  return false;
}

function matchesDescriptor(
  descriptor: CommandDescriptor,
  filter: CommandRegistryFilter,
): boolean {
  if (filter.names && !filter.names.includes(descriptor.name)) {
    return false;
  }

  if (filter.channel && !descriptor.channels.includes(filter.channel)) {
    return false;
  }

  const visibility = resolveVisibilityFilter(filter.visibility);
  if (visibility && !visibility.includes(descriptor.visibility)) {
    return false;
  }

  if (filter.sources && !filter.sources.includes(descriptor.source)) {
    return false;
  }

  if (!matchesSecurityMatrixSubject(descriptor, {
    channel: filter.channel,
    allowedSafeScopes: filter.safeScopes,
  })) {
    return false;
  }

  if (filter.includeSensitive === false && descriptor.isSensitive) {
    return false;
  }

  return isFeatureFlagEnabled(descriptor, filter);
}

export class CommandRegistry {
  readonly #descriptors = new Map<string, CommandDescriptor>();

  constructor(descriptors: readonly CommandDescriptor[] = []) {
    this.registerMany(descriptors);
  }

  register(descriptor: CommandDescriptor): this {
    if (this.#descriptors.has(descriptor.name)) {
      throw new Error(`Duplicate command descriptor: ${descriptor.name}`);
    }
    this.#descriptors.set(descriptor.name, descriptor);
    return this;
  }

  registerMany(descriptors: readonly CommandDescriptor[]): this {
    for (const descriptor of descriptors) {
      this.register(descriptor);
    }
    return this;
  }

  get(name: string): CommandDescriptor | undefined {
    return this.#descriptors.get(name);
  }

  list(filter: CommandRegistryFilter = {}): CommandDescriptor[] {
    return [...this.#descriptors.values()].filter((descriptor) =>
      matchesDescriptor(descriptor, filter),
    );
  }

  toSubCommands(filter: CommandRegistryFilter = {}): SubCommandsDef {
    return Object.fromEntries(
      this.list(filter).map((descriptor) => [
        descriptor.name,
        () => loadCommandDefinition(descriptor),
      ]),
    ) as SubCommandsDef;
  }
}
