import type { ExtensionHostLifecycleSummary } from "./extension-host.js";
import type { ExtensionMarketplaceStateSnapshot, InstalledExtensionRecord } from "./extension-marketplace-state.js";
import type { ExtensionRuntimeReport } from "./extension-runtime.js";

export type ExtensionGovernanceReport = {
  loadError?: string;
  summary: {
    installedExtensionCount: number;
    installedEnabledExtensionCount: number;
    installedDisabledExtensionCount: number;
    installedBrokenExtensionCount: number;
    loadedMarketplaceExtensionCount: number;
    loadedMarketplacePluginCount: number;
    loadedMarketplaceSkillPackCount: number;
    runtimePolicyDisabledPluginCount: number;
    runtimePolicyDisabledSkillCount: number;
  };
  layers: {
    installedLedger: {
      extensionIds: string[];
      enabledExtensionIds: string[];
      disabledExtensionIds: string[];
      brokenExtensionIds: string[];
    };
    hostLoad: {
      lifecycleAvailable: boolean;
      loadedMarketplaceExtensionCount: number;
      loadedMarketplacePluginCount: number;
      loadedMarketplaceSkillPackCount: number;
    };
    runtimePolicy: {
      disabledPluginIds: string[];
      disabledSkillNames: string[];
    };
  };
  notes: {
    installedLedger: string;
    runtimePolicy: string;
  };
};

function sortStrings(values: string[]): string[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function pickExtensionIds(
  installedExtensions: InstalledExtensionRecord[],
  predicate: (extension: InstalledExtensionRecord) => boolean,
): string[] {
  return sortStrings(installedExtensions.filter(predicate).map((extension) => extension.id));
}

export function buildExtensionGovernanceReport(input: {
  extensionRuntime: ExtensionRuntimeReport;
  extensionMarketplace?: ExtensionMarketplaceStateSnapshot;
  extensionHostLifecycle?: Pick<
    ExtensionHostLifecycleSummary,
    | "installedMarketplaceExtensionsLoaded"
    | "installedMarketplacePluginsLoaded"
    | "installedMarketplaceSkillPacksLoaded"
  >;
  loadError?: string;
}): ExtensionGovernanceReport {
  const installedExtensions = Object.values(input.extensionMarketplace?.installedExtensions.extensions ?? {});
  const enabledExtensionIds = pickExtensionIds(installedExtensions, (extension) => extension.enabled);
  const disabledExtensionIds = pickExtensionIds(installedExtensions, (extension) => !extension.enabled);
  const brokenExtensionIds = pickExtensionIds(installedExtensions, (extension) => extension.status === "broken");
  const disabledPluginIds = sortStrings(
    input.extensionRuntime.plugins
      .filter((plugin) => plugin.disabled)
      .map((plugin) => plugin.id),
  );
  const disabledSkillNames = sortStrings(
    input.extensionRuntime.skills
      .filter((skill) => skill.disabled)
      .map((skill) => skill.name),
  );

  return {
    loadError: input.loadError,
    summary: {
      installedExtensionCount: installedExtensions.length,
      installedEnabledExtensionCount: enabledExtensionIds.length,
      installedDisabledExtensionCount: disabledExtensionIds.length,
      installedBrokenExtensionCount: brokenExtensionIds.length,
      loadedMarketplaceExtensionCount: input.extensionHostLifecycle?.installedMarketplaceExtensionsLoaded ?? 0,
      loadedMarketplacePluginCount: input.extensionHostLifecycle?.installedMarketplacePluginsLoaded ?? 0,
      loadedMarketplaceSkillPackCount: input.extensionHostLifecycle?.installedMarketplaceSkillPacksLoaded ?? 0,
      runtimePolicyDisabledPluginCount: disabledPluginIds.length,
      runtimePolicyDisabledSkillCount: disabledSkillNames.length,
    },
    layers: {
      installedLedger: {
        extensionIds: pickExtensionIds(installedExtensions, () => true),
        enabledExtensionIds,
        disabledExtensionIds,
        brokenExtensionIds,
      },
      hostLoad: {
        lifecycleAvailable: Boolean(input.extensionHostLifecycle),
        loadedMarketplaceExtensionCount: input.extensionHostLifecycle?.installedMarketplaceExtensionsLoaded ?? 0,
        loadedMarketplacePluginCount: input.extensionHostLifecycle?.installedMarketplacePluginsLoaded ?? 0,
        loadedMarketplaceSkillPackCount: input.extensionHostLifecycle?.installedMarketplaceSkillPacksLoaded ?? 0,
      },
      runtimePolicy: {
        disabledPluginIds,
        disabledSkillNames,
      },
    },
    notes: {
      installedLedger: "installed extension.enabled controls whether a marketplace-installed extension enters host loading.",
      runtimePolicy: "toolsConfig.disabled.plugins/skills only disables already-loaded runtime plugins or skills.",
    },
  };
}
