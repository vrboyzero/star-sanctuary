import fs from "node:fs";
import path from "node:path";

const RUNTIME_ALWAYS_INCLUDED_DEPENDENCIES = [
  {
    dependency: "better-sqlite3",
    sourcePackage: "@belldandy/memory",
    reason: "Default SQLite memory store is part of every runtime.",
  },
  {
    dependency: "sqlite-vec",
    sourcePackage: "@belldandy/memory",
    reason: "Vector search stays enabled in every runtime.",
  },
  {
    dependency: "puppeteer-core",
    sourcePackage: "@belldandy/skills",
    reason: "Browser automation remains enabled in the default package.",
  },
  {
    dependency: "jsdom",
    sourcePackage: "@belldandy/skills",
    reason: "HTML parsing remains enabled in the default package.",
  },
  {
    dependency: "@mozilla/readability",
    sourcePackage: "@belldandy/skills",
    reason: "Web article extraction remains enabled in the default package.",
  },
  {
    dependency: "turndown",
    sourcePackage: "@belldandy/skills",
    reason: "HTML to Markdown conversion remains enabled in the default package.",
  },
];

const RUNTIME_OPTIONAL_DEPENDENCY_POLICY = [
  {
    dependency: "fastembed",
    sourcePackage: "@belldandy/memory",
    packageDir: "belldandy-memory",
    enabledIn: ["full"],
    excludedIn: ["slim"],
    reason: "Local embedding backend is only bundled in full because it pulls extra native runtime payloads.",
  },
  {
    dependency: "node-pty",
    sourcePackage: "@belldandy/skills",
    packageDir: "belldandy-skills",
    enabledIn: ["full"],
    excludedIn: ["slim"],
    reason: "Native PTY backend is only bundled in full; slim keeps the child_process fallback.",
  },
];

function sortStrings(values) {
  return [...values].sort((a, b) => a.localeCompare(b));
}

function readPackageJson(workspaceRoot, packageDir) {
  return JSON.parse(
    fs.readFileSync(path.join(workspaceRoot, "packages", packageDir, "package.json"), "utf-8"),
  );
}

export function collectRuntimeOptionalDependencies(params) {
  const { workspaceRoot, packageDirs } = params;
  const optionalDependencies = [];

  for (const packageDir of packageDirs) {
    const packageJson = readPackageJson(workspaceRoot, packageDir);
    const entries = Object.keys(packageJson.optionalDependencies ?? {});
    for (const dependency of entries) {
      optionalDependencies.push({
        dependency,
        sourcePackage: packageJson.name,
        packageDir,
      });
    }
  }

  return optionalDependencies.sort((a, b) => {
    const sourceCompare = a.sourcePackage.localeCompare(b.sourcePackage);
    if (sourceCompare !== 0) return sourceCompare;
    return a.dependency.localeCompare(b.dependency);
  });
}

export function resolveDistributionPolicySummary(params) {
  const { workspaceRoot, packageDirs, mode } = params;
  const actualOptionalDependencies = collectRuntimeOptionalDependencies({
    workspaceRoot,
    packageDirs,
  });
  const expectedOptionalDependencies = sortStrings(
    RUNTIME_OPTIONAL_DEPENDENCY_POLICY.map((entry) => entry.dependency),
  );
  const actualOptionalDependencyNames = sortStrings(
    actualOptionalDependencies.map((entry) => entry.dependency),
  );

  const missingPolicyDependencies = actualOptionalDependencies
    .filter((entry) => !expectedOptionalDependencies.includes(entry.dependency))
    .map((entry) => `${entry.sourcePackage}:${entry.dependency}`);
  if (missingPolicyDependencies.length > 0) {
    throw new Error(
      `Runtime distribution policy is missing optional dependency declarations: ${missingPolicyDependencies.join(", ")}`,
    );
  }

  const missingWorkspaceOptionalDependencies = RUNTIME_OPTIONAL_DEPENDENCY_POLICY
    .filter((entry) => !actualOptionalDependencies.some((candidate) => candidate.dependency === entry.dependency))
    .map((entry) => `${entry.sourcePackage}:${entry.dependency}`);
  if (missingWorkspaceOptionalDependencies.length > 0) {
    throw new Error(
      `Runtime distribution policy references optional dependencies that are no longer present: ${missingWorkspaceOptionalDependencies.join(", ")}`,
    );
  }

  const includedOptionalDependencies = sortStrings(
    RUNTIME_OPTIONAL_DEPENDENCY_POLICY
      .filter((entry) => entry.enabledIn.includes(mode))
      .map((entry) => entry.dependency),
  );
  const excludedOptionalDependencies = sortStrings(
    RUNTIME_OPTIONAL_DEPENDENCY_POLICY
      .filter((entry) => entry.excludedIn.includes(mode))
      .map((entry) => entry.dependency),
  );

  return {
    policyVersion: 1,
    mode,
    summary: mode === "full"
      ? "full bundles the runtime optional/native backends for local embedding and PTY."
      : "slim keeps browser/web extraction enabled but excludes the runtime optional/native backends for local embedding and PTY.",
    alwaysIncluded: RUNTIME_ALWAYS_INCLUDED_DEPENDENCIES,
    optionalDependencies: RUNTIME_OPTIONAL_DEPENDENCY_POLICY,
    includedOptionalDependencies,
    excludedOptionalDependencies,
    actualRuntimeOptionalDependencies: actualOptionalDependencyNames,
  };
}
