import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  getInstalledExtensionsLedgerPath,
  getKnownMarketplacesLedgerPath,
  loadExtensionMarketplaceState,
  upsertInstalledExtension,
  upsertKnownMarketplace,
} from "./extension-marketplace-state.js";

describe("extension marketplace state", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) {
        await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
      }
    }
  });

  it("persists known marketplaces and installed extensions with summary counts", async () => {
    const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "belldandy-extension-marketplace-"));
    tempDirs.push(stateDir);

    await upsertKnownMarketplace(stateDir, {
      name: "official-market",
      source: {
        source: "github",
        repo: "star-sanctuary/official-market",
        ref: "main",
      },
      installLocation: path.join(stateDir, "extensions", "cache", "official-market"),
      autoUpdate: true,
      lastUpdated: "2026-04-02T12:30:00.000Z",
    });
    await upsertInstalledExtension(stateDir, {
      name: "demo-plugin",
      kind: "plugin",
      marketplace: "official-market",
      version: "1.2.3",
      manifestPath: "belldandy-extension.json",
      installPath: path.join(stateDir, "extensions", "installed", "official-market", "demo-plugin"),
      status: "installed",
      enabled: true,
      lastUpdated: "2026-04-02T12:31:00.000Z",
    });
    await upsertInstalledExtension(stateDir, {
      name: "ops-skills",
      kind: "skill-pack",
      marketplace: "official-market",
      version: "0.4.0",
      installPath: path.join(stateDir, "extensions", "installed", "official-market", "ops-skills"),
      status: "broken",
      enabled: false,
    });

    const snapshot = await loadExtensionMarketplaceState(stateDir);

    expect(snapshot.summary).toEqual({
      knownMarketplaceCount: 1,
      autoUpdateMarketplaceCount: 1,
      installedExtensionCount: 2,
      installedPluginCount: 1,
      installedSkillPackCount: 1,
      pendingExtensionCount: 0,
      brokenExtensionCount: 1,
      disabledExtensionCount: 1,
    });
    expect(snapshot.knownMarketplaces.marketplaces["official-market"]).toEqual(
      expect.objectContaining({
        name: "official-market",
        autoUpdate: true,
      }),
    );
    expect(snapshot.installedExtensions.extensions["demo-plugin@official-market"]).toEqual(
      expect.objectContaining({
        name: "demo-plugin",
        kind: "plugin",
        marketplace: "official-market",
      }),
    );

    const knownLedger = JSON.parse(await fs.readFile(getKnownMarketplacesLedgerPath(stateDir), "utf-8"));
    const installedLedger = JSON.parse(await fs.readFile(getInstalledExtensionsLedgerPath(stateDir), "utf-8"));
    expect(knownLedger.version).toBe(1);
    expect(installedLedger.version).toBe(1);
  });
});
