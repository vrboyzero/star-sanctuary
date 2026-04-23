import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "vitest";

function readInstallScript(): string {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const workspaceRoot = path.resolve(currentDir, "..", "..", "..");
  return fs.readFileSync(path.join(workspaceRoot, "install.ps1"), "utf-8");
}

test("install.ps1 Windows start.bat wrapper defaults AUTO_OPEN_BROWSER safely", () => {
  const script = readInstallScript();

  expect(script).toContain('if not defined AUTO_OPEN_BROWSER set "AUTO_OPEN_BROWSER=true"');
  expect(script).toContain('if /I "%CI%"=="true" set "AUTO_OPEN_BROWSER=false"');
  expect(script).toContain("echo [Star Sanctuary Launcher] Starting Gateway...");
  expect(script).toContain("echo [Star Sanctuary Launcher] WebChat: http://localhost:28889");
  expect(script).toContain("call node \"%INSTALL_ROOT%current\\packages\\belldandy-core\\dist\\bin\\bdd.js\" start %*");
});

test("install.ps1 Windows start.ps1 wrapper defaults AUTO_OPEN_BROWSER safely", () => {
  const script = readInstallScript();

  expect(script).toContain("if ([string]::IsNullOrWhiteSpace($env:AUTO_OPEN_BROWSER)) {");
  expect(script).toContain("$env:AUTO_OPEN_BROWSER = if ($env:CI -eq 'true') { 'false' } else { 'true' }");
  expect(script).toContain("} elseif ($env:CI -eq 'true') {");
  expect(script).toContain("$env:AUTO_OPEN_BROWSER = 'false'");
  expect(script).toContain("Write-Host '[Star Sanctuary Launcher] Starting Gateway...'");
  expect(script).toContain("Write-Host '[Star Sanctuary Launcher] WebChat: http://localhost:28889'");
  expect(script).toContain("& node (Join-Path $scriptDir 'current\\packages\\belldandy-core\\dist\\bin\\bdd.js') 'start' @args");
});

test("install.ps1 desktop shortcut uses the packaged ico when available", () => {
  const script = readInstallScript();

  expect(script).toContain('$iconPath = Join-Path $InstallRoot "current\\apps\\web\\public\\logo06-256.ico"');
  expect(script).toContain("if (Test-Path $iconPath -PathType Leaf) {");
  expect(script).toContain("$shortcut.IconLocation = $iconPath");
});
