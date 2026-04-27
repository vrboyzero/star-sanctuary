import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function getArg(name) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((arg) => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}

function sha256File(targetPath) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(targetPath));
  return hash.digest("hex").toUpperCase();
}

function expectExists(targetPath, label) {
  if (!fs.existsSync(targetPath)) {
    throw new Error(`Missing ${label}: ${path.relative(workspaceRoot, targetPath)}`);
  }
}

function expectContains(text, needle, label) {
  if (!text.includes(needle)) {
    throw new Error(`Expected ${label} to contain: ${needle}`);
  }
}

function runWingetValidate(manifestRoot) {
  if (process.platform !== "win32") {
    return { skipped: true, reason: "winget validate is only available on Windows." };
  }

  const probe = spawnSync("winget", ["--version"], {
    cwd: workspaceRoot,
    stdio: "pipe",
    encoding: "utf-8",
  });
  if (probe.error?.code === "ENOENT") {
    return { skipped: true, reason: "winget command is not available on PATH." };
  }
  if (probe.status !== 0) {
    throw new Error(`Failed to probe winget: ${probe.stderr || probe.stdout}`);
  }

  const result = spawnSync("winget", ["validate", "--manifest", manifestRoot, "--disable-interactivity"], {
    cwd: workspaceRoot,
    stdio: "pipe",
    encoding: "utf-8",
  });
  if (result.status !== 0) {
    throw new Error(`winget validate failed:\n${result.stderr || result.stdout}`);
  }
  return { skipped: false };
}

function main() {
  const version = String(getArg("version") || "").trim();
  if (!version) {
    throw new Error("verify-winget-assets requires --version=<version>.");
  }

  const packageIdentifier = getArg("package-id") || "Vrboyzero.StarSanctuary";
  const packageLocale = getArg("package-locale") || "en-US";
  const versionRoot = path.join(workspaceRoot, "artifacts", "winget", `v${version}`);
  const metadataCandidates = fs.existsSync(versionRoot)
    ? fs.readdirSync(versionRoot).filter((name) => name.endsWith(".metadata.json"))
    : [];

  if (metadataCandidates.length !== 1) {
    throw new Error(`Expected exactly one winget metadata file under ${path.relative(workspaceRoot, versionRoot)}.`);
  }

  const metadataPath = path.join(versionRoot, metadataCandidates[0]);
  const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf-8"));
  const zipPath = path.join(workspaceRoot, metadata.asset.path);
  const sha256Path = path.join(versionRoot, `${path.basename(zipPath, ".zip")}.sha256`);

  expectExists(zipPath, "winget zip");
  expectExists(sha256Path, "winget sha256");

  const expectedSha = sha256File(zipPath);
  const shaText = fs.readFileSync(sha256Path, "utf-8").trim();
  const expectedShaLine = `${expectedSha}  ${path.basename(zipPath)}`;
  if (shaText !== expectedShaLine) {
    throw new Error(`winget sha256 mismatch: expected '${expectedShaLine}', got '${shaText}'.`);
  }

  const manifestRoot = path.join(workspaceRoot, metadata.manifests.root);
  const versionManifestPath = path.join(manifestRoot, `${packageIdentifier}.yaml`);
  const installerManifestPath = path.join(manifestRoot, `${packageIdentifier}.installer.yaml`);
  const localeManifestPath = path.join(manifestRoot, `${packageIdentifier}.locale.${packageLocale}.yaml`);
  expectExists(versionManifestPath, "winget version manifest");
  expectExists(installerManifestPath, "winget installer manifest");
  expectExists(localeManifestPath, "winget locale manifest");

  const versionManifest = fs.readFileSync(versionManifestPath, "utf-8");
  const installerManifest = fs.readFileSync(installerManifestPath, "utf-8");
  const localeManifest = fs.readFileSync(localeManifestPath, "utf-8");

  expectContains(versionManifest, `PackageVersion: ${version}`, "version manifest");
  expectContains(versionManifest, "ManifestType: version", "version manifest");

  expectContains(installerManifest, `InstallerUrl: ${metadata.asset.installerUrl}`, "installer manifest");
  expectContains(installerManifest, `InstallerSha256: ${expectedSha}`, "installer manifest");
  expectContains(installerManifest, `RelativeFilePath: ${metadata.asset.nestedInstallerRelativeFilePath}`, "installer manifest");
  expectContains(installerManifest, `PortableCommandAlias: ${metadata.asset.portableCommandAlias}`, "installer manifest");

  expectContains(localeManifest, `PackageName: "${metadata.manifests.packageName}"`, "locale manifest");
  expectContains(localeManifest, `Moniker: ${metadata.manifests.moniker}`, "locale manifest");
  expectContains(localeManifest, "ManifestType: defaultLocale", "locale manifest");

  const wingetValidate = runWingetValidate(manifestRoot);
  if (wingetValidate.skipped) {
    console.log(`[verify:winget] skipped winget validate: ${wingetValidate.reason}`);
  }

  console.log(`[verify:winget] verified ${path.relative(workspaceRoot, versionRoot)}`);
}

main();
