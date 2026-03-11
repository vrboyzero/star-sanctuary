function formatDependencyList(values) {
  return values.length > 0 ? values.join(", ") : "(none)";
}

function renderPolicyLines(distributionPolicy) {
  return [
    `- Distribution policy: ${distributionPolicy.summary}`,
    `- Always included runtime dependencies: ${distributionPolicy.alwaysIncluded.map((entry) => entry.dependency).join(", ")}.`,
    `- Mode-specific optional dependencies included in this build: ${formatDependencyList(distributionPolicy.includedOptionalDependencies)}.`,
    `- Mode-specific optional dependencies excluded in this build: ${formatDependencyList(distributionPolicy.excludedOptionalDependencies)}.`,
  ];
}

export function renderPortableGuide(params) {
  const { executableName, distributionPolicy, mode } = params;
  const modeDescription = mode === "full"
    ? "This is the full portable build: local embedding and the native PTY backend are bundled."
    : "This is the slim portable build: browser/web extraction stays enabled, while local embedding and the native PTY backend stay optional.";

  return [
    "# Star Sanctuary Portable",
    "",
    "This directory is the Windows portable build of Star Sanctuary.",
    "Keep all files and folders in this directory together when moving or copying the package.",
    "",
    "Quick start:",
    "1. Double-click `start.bat`.",
    "2. If PowerShell is preferred, run `start.ps1`.",
    `3. If the browser does not open automatically, open http://127.0.0.1:28889/ manually after \`${executableName}\` starts.`,
    "",
    "What lives where:",
    "- `.env` / `.env.local`: next to `start.bat`.",
    "- Runtime files: `runtime/`.",
    "- Launcher files: `launcher/`.",
    "- Recovery payload used for automatic runtime repair: `payload/`.",
    "- User state, sessions, logs, and workspace data: `~/.star_sanctuary` unless `BELLDANDY_STATE_DIR` is set.",
    "",
    "Build mode:",
    `- ${modeDescription}`,
    ...renderPolicyLines(distributionPolicy),
    "",
    "Self-check:",
    "- First launch and automatic runtime repair can take up to about one minute. Wait before retrying.",
    "- If startup fails, run `start.ps1` from PowerShell so the console stays open and the last error is visible.",
    "- If runtime repair keeps failing, close all `star-sanctuary.exe` processes, keep `payload/`, back up `.env*`, delete `runtime/`, and run `start.bat` again.",
    "- If the app starts but no browser opens, visit http://127.0.0.1:28889/ manually.",
    "- Do not delete `launcher/`, `payload/`, `version.json`, or `runtime-manifest.json`; they are part of the portable repair path.",
    "",
    "When asking for help:",
    "- Share `version.json` and `runtime-manifest.json` from this directory.",
    "- Include the package mode (`slim` or `full`) and the last console output from `start.ps1`.",
    "- Redact secrets before sharing `.env` or `.env.local`.",
    "",
  ].join("\r\n");
}

export function renderSingleExeGuide(params) {
  const { executableName, distributionPolicy, mode, runtimeHomeHint } = params;
  const modeDescription = mode === "full"
    ? "This is the full single-exe build: local embedding and the native PTY backend are bundled."
    : "This is the slim single-exe build: browser/web extraction stays enabled, while local embedding and the native PTY backend stay optional.";

  return [
    "# Star Sanctuary Single-Exe",
    "",
    "This directory contains the Windows single-exe build of Star Sanctuary.",
    "",
    "Quick start:",
    `1. Double-click \`${executableName}\`.`,
    `2. On first launch, the executable extracts its runtime cache under \`${runtimeHomeHint}\`.`,
    "3. If the browser does not open automatically, open http://127.0.0.1:28889/ manually after the app starts.",
    "",
    "What lives where:",
    "- The executable stays in this directory.",
    `- Extracted runtime cache lives under \`${runtimeHomeHint}\`.`,
    "- `.env` / `.env.local`, state, sessions, logs, and workspace data default to `~/.star_sanctuary` unless advanced env vars override them.",
    "",
    "Build mode:",
    `- ${modeDescription}`,
    ...renderPolicyLines(distributionPolicy),
    "",
    "Self-check:",
    "- First launch, upgrades, or automatic runtime repair can take up to about one minute.",
    "- If startup fails once, close the app and run it again; the launcher validates and repairs the extracted runtime automatically.",
    `- Safe reset: close all Star Sanctuary processes, delete \`${runtimeHomeHint}\`, then run \`${executableName}\` again.`,
    "- If the app starts but no browser opens, visit http://127.0.0.1:28889/ manually.",
    "- Use `single-exe.json` in this directory to confirm version, mode, and embedded runtime summary before reporting a bug.",
    "",
    "When asking for help:",
    "- Share `single-exe.json` from this directory.",
    `- Mention whether the runtime cache under \`${runtimeHomeHint}\` was freshly extracted or recovered.`,
    "- Share the last visible error message or console output, if any.",
    "- Redact secrets before sharing `.env` or `.env.local`.",
    "",
  ].join("\r\n");
}
