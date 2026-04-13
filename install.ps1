param(
  [string]$Version = "latest",
  [string]$InstallDir,
  [string]$RepoOwner = "vrboyzero",
  [string]$RepoName = "star-sanctuary",
  [string]$SourceDir,
  [switch]$SkipInstallBuild,
  [switch]$NoSetup,
  [switch]$ForceSetup,
  [switch]$NoDesktopShortcut
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$MinimumNodeMajor = 22
$MinimumNodeMinor = 12
$FirstStartNoticeFileName = "first-start-notice.txt"

function Write-Step {
  param([string]$Message)
  Write-Host "[install] $Message"
}

function Write-InstallHintBlock {
  param([string]$Message)

  $hints = @()

  if ($Message -match "Node\.js was not found" -or $Message -match "Node\.js v.* is too old" -or $Message -match "Failed to detect Node\.js version") {
    $hints += "Use Node.js v22.12+ LTS, then reopen the terminal so node/corepack are available on PATH."
  }

  if ($Message -match "corepack was not found" -or $Message -match "corepack prepare .* failed") {
    $hints += "Install or repair a Node.js distribution that includes corepack, then rerun the installer."
  }

  if ($Message -match "corepack pnpm install failed" -or $Message -match "corepack pnpm build failed") {
    $hints += "Default install/start does not require optional native features like node-pty, fastembed, protobufjs, or onnxruntime-node."
    $hints += "A plain 'pnpm approve-builds' reminder is not a blocker for the default install/build path."
    $hints += "If the log mentions better-sqlite3, native bindings, ABI, or postinstall failures, switch to Node.js v22.12+ LTS and rerun."
    $hints += "If the log mentions registry, tarball, ECONNRESET, ETIMEDOUT, or proxy access, fix network/registry access and rerun."
  }

  if ($Message -match "'bdd setup' exited with code") {
    $hints += "Install/build already completed. Fix the setup issue and rerun '$InstallDir\\bdd.cmd setup' or rerun the installer with -ForceSetup."
  }

  if ($hints.Count -eq 0) {
    return
  }

  foreach ($hint in $hints | Select-Object -Unique) {
    Write-Host "[install] HINT: $hint" -ForegroundColor Yellow
  }
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

function New-SourceJunction {
  param(
    [string]$LinkPath,
    [string]$TargetPath
  )

  $null = New-Item -ItemType Junction -Path $LinkPath -Target $TargetPath
}

function Copy-SourceTree {
  param(
    [string]$SourceRoot,
    [string]$TargetRoot
  )

  New-Item -ItemType Directory -Path $TargetRoot -Force | Out-Null
  foreach ($entry in (Get-ChildItem -LiteralPath $SourceRoot -Force)) {
    Copy-Item -LiteralPath $entry.FullName -Destination $TargetRoot -Recurse -Force
  }
}

function Invoke-TestFailPoint {
  param([string]$Point)

  if ($env:STAR_SANCTUARY_INSTALL_TEST_FAIL_AT -eq $Point) {
    throw "Installer test failpoint triggered at $Point."
  }
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

function Backup-InstallRootFiles {
  param(
    [string]$Root,
    [string]$BackupDir,
    [string[]]$Files
  )

  New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
  foreach ($file in $Files) {
    $sourcePath = Join-Path $Root $file
    if (Test-Path $sourcePath) {
      $targetPath = Join-Path $BackupDir $file
      $targetDir = Split-Path -Parent $targetPath
      if (-not [string]::IsNullOrWhiteSpace($targetDir)) {
        New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
      }
      Copy-Item -LiteralPath $sourcePath -Destination $targetPath -Force
    }
  }
}

function Restore-InstallRootFiles {
  param(
    [string]$Root,
    [string]$BackupDir,
    [string[]]$Files
  )

  foreach ($file in $Files) {
    $targetPath = Join-Path $Root $file
    $backupPath = Join-Path $BackupDir $file
    if (Test-Path $backupPath) {
      Copy-Item -LiteralPath $backupPath -Destination $targetPath -Force
    } elseif (Test-Path $targetPath) {
      Remove-Item -LiteralPath $targetPath -Force -ErrorAction SilentlyContinue
    }
  }
}

function Write-WindowsWrappers {
  param([string]$Root)

  $startBat = @"
@echo off
setlocal
set "INSTALL_ROOT=%~dp0"
set "FIRST_START_NOTICE=%INSTALL_ROOT%$FirstStartNoticeFileName"
set "STAR_SANCTUARY_RUNTIME_MODE=source"
set "BELLDANDY_RUNTIME_MODE=source"
set "STAR_SANCTUARY_RUNTIME_DIR=%INSTALL_ROOT%current"
set "BELLDANDY_RUNTIME_DIR=%INSTALL_ROOT%current"
set "STAR_SANCTUARY_ENV_DIR=%INSTALL_ROOT%"
set "BELLDANDY_ENV_DIR=%INSTALL_ROOT%"
if exist "%FIRST_START_NOTICE%" (
echo [Star Sanctuary Launcher] Post-install note:
type "%FIRST_START_NOTICE%"
del /f /q "%FIRST_START_NOTICE%" >nul 2>nul
echo.
)
call node "%INSTALL_ROOT%current\packages\belldandy-core\dist\bin\bdd.js" start %*
exit /b %ERRORLEVEL%
"@
  Write-File -Path (Join-Path $Root "start.bat") -Content ($startBat.TrimStart("`r", "`n") + "`r`n")

  $startPs1 = @'
$ErrorActionPreference = 'Stop'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$noticePath = Join-Path $scriptDir 'first-start-notice.txt'
$env:STAR_SANCTUARY_RUNTIME_MODE = 'source'
$env:BELLDANDY_RUNTIME_MODE = 'source'
$env:STAR_SANCTUARY_RUNTIME_DIR = Join-Path $scriptDir 'current'
$env:BELLDANDY_RUNTIME_DIR = $env:STAR_SANCTUARY_RUNTIME_DIR
$env:STAR_SANCTUARY_ENV_DIR = $scriptDir
$env:BELLDANDY_ENV_DIR = $scriptDir
if (Test-Path $noticePath) {
  Write-Host '[Star Sanctuary Launcher] Post-install note:'
  Get-Content -LiteralPath $noticePath
  Remove-Item -LiteralPath $noticePath -Force -ErrorAction SilentlyContinue
  Write-Host ''
}
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
    notices = @{
      firstStart = $FirstStartNoticeFileName
    }
  }

  Write-File -Path (Join-Path $Root "install-info.json") -Content (($payload | ConvertTo-Json -Depth 5) + "`n")
}

function Write-FirstStartNotice {
  param(
    [string]$Root,
    [string[]]$Lines
  )

  $noticePath = Join-Path $Root $FirstStartNoticeFileName
  $normalizedLines = @($Lines | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
  if ($normalizedLines.Count -eq 0) {
    Remove-Item -LiteralPath $noticePath -Force -ErrorAction SilentlyContinue
    return
  }

  Write-File -Path $noticePath -Content (($normalizedLines -join "`r`n") + "`r`n")
}

function Get-SetupPlan {
  param(
    [string]$InstallRoot,
    [switch]$NoSetup,
    [switch]$ForceSetup
  )

  $envLocalPath = Join-Path $InstallRoot ".env.local"
  if ($NoSetup) {
    return @{
      ShouldRun = $false
      StepMessage = "Skipping bdd setup (-NoSetup)"
      Summary = "skipped by -NoSetup; run $InstallRoot\bdd.cmd setup when you are ready to refresh config"
      FirstStartSummary = $null
      FirstStartNotice = @()
    }
  }

  if ($ForceSetup) {
    return @{
      ShouldRun = $true
      StepMessage = "Launching bdd setup (-ForceSetup)"
      Summary = "re-ran during install (-ForceSetup)"
      FirstStartSummary = $null
      FirstStartNotice = @()
    }
  }

  if (Test-Path $envLocalPath -PathType Leaf) {
    return @{
      ShouldRun = $false
      StepMessage = "Detected existing .env.local at $envLocalPath; skipping bdd setup for upgrade handoff"
      Summary = "skipped by default because existing .env.local was preserved; run $InstallRoot\bdd.cmd setup or rerun installer with -ForceSetup to refresh config"
      FirstStartSummary = "will reuse preserved .env.local; run $InstallRoot\bdd.cmd setup later if provider/channel/auth config needs refresh"
      FirstStartNotice = @(
        "[NOTICE] Upgrade preserved your existing .env.local and skipped bdd setup.",
        "[NOTICE] This first start will reuse your current config.",
        "[NOTICE] If provider, channel, or auth settings need refresh, run: $InstallRoot\bdd.cmd setup",
        "[NOTICE] Or rerun the installer with -ForceSetup."
      )
    }
  }

  return @{
    ShouldRun = $true
    StepMessage = "Launching bdd setup"
    Summary = "completed during install"
    FirstStartSummary = $null
    FirstStartNotice = @()
  }
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

if ($NoSetup -and $ForceSetup) {
  throw "-NoSetup and -ForceSetup cannot be used together."
}

$installRoot = [System.IO.Path]::GetFullPath($InstallDir)
$currentRoot = Join-Path $installRoot "current"
$backupRoot = Join-Path $installRoot "backups"
$stagingBaseDir = Join-Path ([System.IO.Path]::GetDirectoryName($installRoot)) ".install-staging"
$tempRoot = New-TempDirectory -BaseDir $stagingBaseDir
$managedInstallFiles = @("start.bat", "start.ps1", "bdd.cmd", "install-info.json", $FirstStartNoticeFileName)
$installRootFilesBackupDir = Join-Path $tempRoot "install-root-files-backup"
$backupPath = $null
$installSucceeded = $false
$setupPlan = $null

try {
  Ensure-NodeRuntime
  $localSourceRoot = $null
  $release = $null
  $resolvedTag = $null
  $versionName = $null
  $normalizedVersion = Normalize-Version -RawVersion $Version

  if (-not [string]::IsNullOrWhiteSpace($SourceDir)) {
    $localSourceRoot = [System.IO.Path]::GetFullPath($SourceDir)
    if (-not (Test-Path $localSourceRoot -PathType Container)) {
      throw "SourceDir was not found: $localSourceRoot"
    }

    $resolvedTag = if ($normalizedVersion -eq "latest") { "local-source" } else { $normalizedVersion }
    $versionName = $resolvedTag
    Write-Step "Using local source override from $localSourceRoot"
  } else {
    $release = Get-ReleaseMetadata -Owner $RepoOwner -Name $RepoName -RequestedVersion $Version
    if (-not $release.zipball_url) {
      throw "The selected release does not expose a GitHub source zipball."
    }

    $resolvedTag = [string]$release.tag_name
    if ([string]::IsNullOrWhiteSpace($resolvedTag)) {
      throw "Failed to resolve release tag from GitHub metadata."
    }

    $versionName = (([string]$release.name).Trim())
    if ([string]::IsNullOrWhiteSpace($versionName)) {
      $versionName = $resolvedTag
    }
  }

  Write-Step "Installing Star Sanctuary $resolvedTag into $installRoot"

  $sourceRoot = $null
  if ($localSourceRoot) {
    $sourceRoot = Get-Item -LiteralPath $localSourceRoot
  } else {
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
  }

  New-Item -ItemType Directory -Path $installRoot -Force | Out-Null
  New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null
  Backup-InstallRootFiles -Root $installRoot -BackupDir $installRootFilesBackupDir -Files $managedInstallFiles

  if (Test-Path $currentRoot) {
    $backupName = "current-" + (Get-Date -Format "yyyyMMdd-HHmmss")
    $backupPath = Join-Path $backupRoot $backupName
    Write-Step "Backing up existing installation to $backupPath"
    Move-Item -LiteralPath $currentRoot -Destination $backupPath
    Invoke-TestFailPoint -Point "after_backup"
  }

  if ($localSourceRoot) {
    if ($SkipInstallBuild) {
      Write-Step "Promoting local source override into current/ via junction"
      New-SourceJunction -LinkPath $currentRoot -TargetPath $sourceRoot.FullName
    } else {
      Write-Step "Copying local source override into current/ for isolated install/build"
      Copy-SourceTree -SourceRoot $sourceRoot.FullName -TargetRoot $currentRoot
    }
  } else {
    Write-Step "Promoting extracted source tree into current/"
    Move-Item -LiteralPath $sourceRoot.FullName -Destination $currentRoot
  }
  Invoke-TestFailPoint -Point "after_promote"

  Invoke-TestFailPoint -Point "before_install_build"
  if (-not $SkipInstallBuild) {
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
  } else {
    Write-Step "Skipping dependency install/build (-SkipInstallBuild)"
  }

  Write-WindowsWrappers -Root $installRoot
  Write-InstallMetadata -Root $installRoot -TagName $resolvedTag -VersionName $versionName -Owner $RepoOwner -Name $RepoName

  if (-not $NoDesktopShortcut) {
    New-DesktopShortcut -InstallRoot $installRoot
  }

  $setupPlan = Get-SetupPlan -InstallRoot $installRoot -NoSetup:$NoSetup -ForceSetup:$ForceSetup
  if ($setupPlan.ShouldRun) {
    Write-Step $setupPlan.StepMessage
    Invoke-TestFailPoint -Point "before_setup"
    & (Join-Path $installRoot "bdd.cmd") "setup"
    if ($LASTEXITCODE -ne 0) {
      throw "'bdd setup' exited with code $LASTEXITCODE."
    }
  } else {
    Write-Step $setupPlan.StepMessage
  }
  Write-FirstStartNotice -Root $installRoot -Lines $setupPlan.FirstStartNotice

  Write-Step "Install complete."
  Write-Host "  Install root: $installRoot"
  Write-Host "  Start:        $installRoot\start.bat"
  Write-Host "  CLI:          $installRoot\bdd.cmd"
  if ($setupPlan) {
    Write-Host "  Setup:        $($setupPlan.Summary)"
    if ($setupPlan.FirstStartSummary) {
      Write-Host "  First start:  $($setupPlan.FirstStartSummary)"
    }
  }
  $installSucceeded = $true
} catch {
  Write-InstallHintBlock -Message $_.Exception.Message
  if (-not $installSucceeded) {
    if (Test-Path $currentRoot) {
      Remove-Item -LiteralPath $currentRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
    if ($backupPath -and (Test-Path $backupPath)) {
      Move-Item -LiteralPath $backupPath -Destination $currentRoot -Force
    }
    Restore-InstallRootFiles -Root $installRoot -BackupDir $installRootFilesBackupDir -Files $managedInstallFiles
  }
  throw
} finally {
  if (Test-Path $tempRoot) {
    Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
}
