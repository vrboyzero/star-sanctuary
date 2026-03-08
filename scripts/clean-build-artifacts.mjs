import fs from "node:fs";
import path from "node:path";

const workspaceRoot = process.cwd();
const packagesDir = path.join(workspaceRoot, "packages");

const targets = [
  path.join(workspaceRoot, "tsconfig.tsbuildinfo"),
  path.join(workspaceRoot, "apps", "web", "tsconfig.tsbuildinfo"),
];

if (fs.existsSync(packagesDir)) {
  for (const entry of fs.readdirSync(packagesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const packageDir = path.join(packagesDir, entry.name);
    targets.push(path.join(packageDir, "dist"));
    targets.push(path.join(packageDir, "tsconfig.tsbuildinfo"));
  }
}

let removedCount = 0;

for (const target of targets) {
  if (!fs.existsSync(target)) continue;
  fs.rmSync(target, { recursive: true, force: true });
  removedCount += 1;
  console.log(`[clean:build] removed ${path.relative(workspaceRoot, target)}`);
}

console.log(`[clean:build] done, removed ${removedCount} artifact(s)`);
