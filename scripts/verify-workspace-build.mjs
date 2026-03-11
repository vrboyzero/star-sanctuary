import fs from "node:fs";
import path from "node:path";

const workspaceRoot = process.cwd();
const packagesDir = path.join(workspaceRoot, "packages");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function normalizeExportTargets(exportsField) {
  if (!exportsField || typeof exportsField !== "object") return [];
  const targets = [];
  for (const value of Object.values(exportsField)) {
    if (typeof value === "string") {
      targets.push(value);
      continue;
    }
    if (value && typeof value === "object") {
      for (const target of Object.values(value)) {
        if (typeof target === "string") {
          targets.push(target);
        }
      }
    }
  }
  return [...new Set(targets)];
}

const failures = [];

for (const entry of fs.readdirSync(packagesDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;

  const packageDir = path.join(packagesDir, entry.name);
  const packageJsonPath = path.join(packageDir, "package.json");
  if (!fs.existsSync(packageJsonPath)) continue;

  const packageJson = readJson(packageJsonPath);
  if (
    typeof packageJson.name !== "string"
    || (!packageJson.name.startsWith("@belldandy/") && !packageJson.name.startsWith("@star-sanctuary/"))
  ) {
    continue;
  }

  const expectedPaths = new Set();

  if (typeof packageJson.main === "string") {
    expectedPaths.add(packageJson.main);
  }
  if (typeof packageJson.types === "string") {
    expectedPaths.add(packageJson.types);
  }
  for (const target of normalizeExportTargets(packageJson.exports)) {
    expectedPaths.add(target);
  }

  for (const relPath of expectedPaths) {
    const normalized = relPath.replace(/^\.\//, "");
    const absolutePath = path.join(packageDir, normalized);
    if (!fs.existsSync(absolutePath)) {
      failures.push(`${packageJson.name} -> missing ${normalized}`);
    }
  }
}

if (failures.length > 0) {
  console.error("[verify:build] workspace package artifacts are incomplete:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("[verify:build] all workspace package entrypoints are present");
