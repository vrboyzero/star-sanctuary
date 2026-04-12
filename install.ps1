param(
  [string]$Version = "latest",
  [string]$InstallDir,
  [string]$RepoOwner = "vrboyzero",
  [string]$RepoName = "star-sanctuary",
  [switch]$NoSetup,
  [switch]$NoDesktopShortcut
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$MinimumNodeMajor = 22
$MinimumNodeMinor = 12

function Write-Step {
  param([string]$Message)
  Write-Host "[install] $Message"
}

function New-TempDirectory {
  param([string]$BaseDir)

  $root = if ([string]::IsNullOrWhiteSpace($BaseDir)) {
    [System.IO.Path]::GetTempPath()
  } else {
    $BaseDir
  }

  New-Item -ItemType Directory -Path $root -Force | Out-Null
  $path = Join-Path $root ("star-sanctuary-install-" + [Guid]::NewGuid().ToString("N"))
  New-Item -ItemType Directory -Path $path | Out-Null
  return $path
}

function Normalize-Version {
  param([string]$RawVersion)
  if ([string]::IsNullOrWhiteSpace($RawVersion) -or $RawVersion -eq "latest") {
    return "latest"
  }

  if ($RawVersion.StartsWith("v")) {
    return $RawVersion
  }

  return "v$RawVersion"
}

function Get-GitHubHeaders {
  $headers = @{
    "Accept" = "application/vnd.github+json"
    "User-Agent" = "Star-Sanctuary-Installer"
  }

  if ($env:GITHUB_TOKEN) {
    $headers["Authorization"] = "Bearer $($env:GITHUB_TOKEN)"
  }

  return $headers
}

function Get-ReleaseMetadata {
  param(
    [string]$Owner,
    [string]$Name,
    [string]$RequestedVersion
  )

  $normalizedVersion = Normalize-Version -RawVersion $RequestedVersion
  if ($normalizedVersion -ne "latest") {
    return @{
      tag_name = $normalizedVersion
      name = $normalizedVersion
      zipball_url = "https://github.com/$Owner/$Name/archive/refs/tags/$normalizedVersion.zip"
      html_url = "https://github.com/$Owner/$Name/releases/tag/$normalizedVersion"
      source = "tag-archive-direct"
    }
  }

  $endpoint = "https://api.github.com/repos/$Owner/$Name/releases/latest"
  Write-Step "Fetching release metadata from $endpoint"
  return Invoke-RestMethod -Headers (Get-GitHubHeaders) -Uri $endpoint
}

function Ensure-Command {
  param([string]$Name, [string]$Message)
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw $Message
  }
}

function Ensure-NodeRuntime {
  Ensure-Command -Name "node" -Message "Node.js was not found. Install Node.js v22.12+ first."
  Ensure-Command -Name "corepack" -Message "corepack was not found. Install a Node.js distribution that includes corepack."

  $rawVersion = (& node -p "process.versions.node").Trim()
  if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($rawVersion)) {
    throw "Failed to detect Node.js version."
  }

  $parts = $rawVersion.Split(".")
  $major = [int]$parts[0]
  $minor = [int]$parts[1]
  if ($major -lt $MinimumNodeMajor -or ($major -eq $MinimumNodeMajor -and $minor -lt $MinimumNodeMinor)) {
    throw "Node.js v$rawVersion is too old. Install Node.js v22.12+ first."
  }

  Write-Step "Detected Node.js v$rawVersion"
}

function Get-RequiredPackageManager {
  param([string]$SourceRoot)
  $packageManager = (& node -e "const fs=require('fs');const path=require('path');const pkg=JSON.parse(fs.readFileSync(path.join(process.argv[1],'package.json'),'utf8'));process.stdout.write(pkg.packageManager || 'pnpm@10');" $SourceRoot)
  if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($packageManager)) {
    throw "Failed to resolve packageManager from package.json."
  }

  return $packageManager.Trim()
}

function Invoke-InSourceRoot {
  param(
    [string]$SourceRoot,
    [scriptblock]$Action
  )

  Push-Location $SourceRoot
  try {
    & $Action
  } finally {
    Pop-Location
  }
}

function Write-File {
  param(
    [string]$Path,
    [string]$Content
  )

  [System.IO.File]::WriteAllText($Path, $Content, [System.Text.UTF8Encoding]::new($false))
}

function Write-WindowsWrappers {
  param([string]$Root)

  $startBat = @"
@echo off
setlocal
set "INSTALL_ROOT=%~dp0"
set "STAR_SANCTUARY_RUNTIME_MODE=source"
set "BELLDANDY_RUNTIME_MODE=source"
set "STAR_SANCTUARY_RUNTIME_DIR=%INSTALL_ROOT%current"
set "BELLDANDY_RUNTIME_DIR=%INSTALL_ROOT%current"
set "STAR_SANCTUARY_ENV_DIR=%INSTALL_ROOT%"
set "BELLDANDY_ENV_DIR=%INSTALL_ROOT%"
call node "%INSTALL_ROOT%current\packages\belldandy-core\dist\bin\bdd.js" start %*
exit /b %ERRORLEVEL%
"@
  Write-File -Path (Join-Path $Root "start.bat") -Content ($startBat.TrimStart("`r", "`n") + "`r`n")

  $startPs1 = @'
$ErrorActionPreference = 'Stop'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$env:STAR_SANCTUARY_RUNTIME_MODE = 'source'
$env:BELLDANDY_RUNTIME_MODE = 'source'
$env:STAR_SANCTUARY_RUNTIME_DIR = Join-Path $scriptDir 'current'
$env:BELLDANDY_RUNTIME_DIR = $env:STAR_SANCTUARY_RUNTIME_DIR
$env:STAR_SANCTUARY_ENV_DIR = $scriptDir
$env:BELLDANDY_ENV_DIR = $scriptDir
& node (Join-Path $scriptDir 'current\packages\belldandy-core\dist\bin\bdd.js') 'start' @args
'@
  Write-File -Path (Join-Path $Root "start.ps1") -Content ($startPs1.TrimStart("`r", "`n") + "`r`n")

  $bddCmd = @"
@echo off
setlocal
set "INSTALL_ROOT=%~dp0"
set "STAR_SANCTUARY_RUNTIME_MODE=source"
set "BELLDANDY_RUNTIME_MODE=source"
set "STAR_SANCTUARY_RUNTIME_DIR=%INSTALL_ROOT%current"
set "BELLDANDY_RUNTIME_DIR=%INSTALL_ROOT%current"
set "STAR_SANCTUARY_ENV_DIR=%INSTALL_ROOT%"
set "BELLDANDY_ENV_DIR=%INSTALL_ROOT%"
call node "%INSTALL_ROOT%current\packages\belldandy-core\dist\bin\bdd.js" %*
"@
  Write-File -Path (Join-Path $Root "bdd.cmd") -Content ($bddCmd.TrimStart("`r", "`n") + "`r`n")
}

function Write-InstallMetadata {
  param(
    [string]$Root,
    [string]$TagName,
    [string]$VersionName,
    [string]$Owner,
    [string]$Name
  )

  $payload = @{
    productName = "Star Sanctuary"
    tag = $TagName
    version = $VersionName
    source = @{
      type = "github-release-source"
      owner = $Owner
      repo = $Name
    }
    installedAt = [DateTimeOffset]::UtcNow.ToString("o")
    currentDir = "current"
    envDir = "."
    entrypoints = @{
      startBat = "start.bat"
      startPs1 = "start.ps1"
      bddCmd = "bdd.cmd"
    }
  }

  Write-File -Path (Join-Path $Root "install-info.json") -Content (($payload | ConvertTo-Json -Depth 5) + "`n")
}

function New-DesktopShortcut {
  param([string]$InstallRoot)

  $desktopDir = [Environment]::GetFolderPath("Desktop")
  if ([string]::IsNullOrWhiteSpace($desktopDir) -or -not (Test-Path $desktopDir)) {
    Write-Step "Desktop directory was not found. Skipping desktop shortcut."
    return
  }

  $shortcutPath = Join-Path $desktopDir "Star Sanctuary.lnk"
  $targetPath = Join-Path $InstallRoot "start.bat"
  $workingDir = $InstallRoot

  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($shortcutPath)
  $shortcut.TargetPath = $targetPath
  $shortcut.WorkingDirectory = $workingDir
  $shortcut.Description = "Start Star Sanctuary"
  $shortcut.Save()

  Write-Step "Desktop shortcut created at $shortcutPath"
}

if ([string]::IsNullOrWhiteSpace($InstallDir)) {
  if ([string]::IsNullOrWhiteSpace($env:LOCALAPPDATA)) {
    throw "LOCALAPPDATA is not available. Pass -InstallDir explicitly."
  }
  $InstallDir = Join-Path $env:LOCALAPPDATA "StarSanctuary"
}

$installRoot = [System.IO.Path]::GetFullPath($InstallDir)
$currentRoot = Join-Path $installRoot "current"
$backupRoot = Join-Path $installRoot "backups"
$stagingBaseDir = Join-Path ([System.IO.Path]::GetDirectoryName($installRoot)) ".install-staging"
$tempRoot = New-TempDirectory -BaseDir $stagingBaseDir
$backupPath = $null
$installSucceeded = $false

try {
  Ensure-NodeRuntime

  $release = Get-ReleaseMetadata -Owner $RepoOwner -Name $RepoName -RequestedVersion $Version
  if (-not $release.zipball_url) {
    throw "The selected release does not expose a GitHub source zipball."
  }

  $resolvedTag = [string]$release.tag_name
  if ([string]::IsNullOrWhiteSpace($resolvedTag)) {
    throw "Failed to resolve release tag from GitHub metadata."
  }

  Write-Step "Installing Star Sanctuary $resolvedTag into $installRoot"

  $archivePath = Join-Path $tempRoot "source.zip"
  $extractRoot = Join-Path $tempRoot "extract"
  New-Item -ItemType Directory -Path $extractRoot | Out-Null

  Write-Step "Downloading GitHub release source archive"
  Invoke-WebRequest -Headers (Get-GitHubHeaders) -Uri $release.zipball_url -OutFile $archivePath

  Write-Step "Extracting source archive"
  Expand-Archive -LiteralPath $archivePath -DestinationPath $extractRoot -Force

  $sourceRoot = Get-ChildItem -LiteralPath $extractRoot -Directory | Select-Object -First 1
  if (-not $sourceRoot) {
    throw "Failed to locate extracted source root."
  }

  New-Item -ItemType Directory -Path $installRoot -Force | Out-Null
  New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null

  if (Test-Path $currentRoot) {
    $backupName = "current-" + (Get-Date -Format "yyyyMMdd-HHmmss")
    $backupPath = Join-Path $backupRoot $backupName
    Write-Step "Backing up existing installation to $backupPath"
    Move-Item -LiteralPath $currentRoot -Destination $backupPath
  }

  Write-Step "Promoting extracted source tree into current/"
  Move-Item -LiteralPath $sourceRoot.FullName -Destination $currentRoot

  $packageManager = Get-RequiredPackageManager -SourceRoot $currentRoot

  Write-Step "Activating $packageManager via corepack"
  & corepack prepare $packageManager --activate
  if ($LASTEXITCODE -ne 0) {
    throw "corepack prepare $packageManager failed."
  }

  Invoke-InSourceRoot -SourceRoot $currentRoot -Action {
    Write-Step "Installing workspace dependencies"
    & corepack pnpm install
    if ($LASTEXITCODE -ne 0) {
      throw "corepack pnpm install failed."
    }

    Write-Step "Building workspace"
    & corepack pnpm build
    if ($LASTEXITCODE -ne 0) {
      throw "corepack pnpm build failed."
    }
  }

  Write-WindowsWrappers -Root $installRoot
  Write-InstallMetadata -Root $installRoot -TagName $resolvedTag -VersionName (([string]$release.name).Trim()) -Owner $RepoOwner -Name $RepoName

  if (-not $NoDesktopShortcut) {
    New-DesktopShortcut -InstallRoot $installRoot
  }

  if (-not $NoSetup) {
    Write-Step "Launching bdd setup"
    & (Join-Path $installRoot "bdd.cmd") "setup"
    if ($LASTEXITCODE -ne 0) {
      throw "'bdd setup' exited with code $LASTEXITCODE."
    }
  } else {
    Write-Step "Skipping bdd setup (-NoSetup)"
  }

  Write-Step "Install complete."
  Write-Host "  Install root: $installRoot"
  Write-Host "  Start:        $installRoot\start.bat"
  Write-Host "  CLI:          $installRoot\bdd.cmd"
  $installSucceeded = $true
} catch {
  if (-not $installSucceeded) {
    if (Test-Path $currentRoot) {
      Remove-Item -LiteralPath $currentRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
    if ($backupPath -and (Test-Path $backupPath)) {
      Move-Item -LiteralPath $backupPath -Destination $currentRoot -Force
    }
  }
  throw
} finally {
  if (Test-Path $tempRoot) {
    Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
}
