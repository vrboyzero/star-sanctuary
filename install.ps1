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
  $endpoint = if ($normalizedVersion -eq "latest") {
    "https://api.github.com/repos/$Owner/$Name/releases/latest"
  } else {
    "https://api.github.com/repos/$Owner/$Name/releases/tags/$normalizedVersion"
  }
  Write-Step "Fetching release metadata from $endpoint"
  return Invoke-RestMethod -Headers (Get-GitHubHeaders) -Uri $endpoint
}

function Get-ReleasePageUri {
  param(
    [string]$Owner,
    [string]$Name,
    [string]$RequestedVersion
  )

  $normalizedVersion = Normalize-Version -RawVersion $RequestedVersion
  if ($normalizedVersion -eq "latest") {
    return "https://github.com/$Owner/$Name/releases/latest"
  }

  return "https://github.com/$Owner/$Name/releases/tag/$normalizedVersion"
}

function Resolve-ReleaseTagFromPage {
  param(
    [string]$Owner,
    [string]$Name,
    [string]$RequestedVersion
  )

  $pageUri = Get-ReleasePageUri -Owner $Owner -Name $Name -RequestedVersion $RequestedVersion
  Write-Step "Falling back to release page resolution via $pageUri"
  $response = Invoke-WebRequest -Headers (Get-GitHubHeaders) -Uri $pageUri
  $resolvedUri = $response.BaseResponse.ResponseUri.AbsoluteUri
  if ($resolvedUri -match "/releases/tag/(?<tag>v[^/?#]+)") {
    return $Matches["tag"]
  }

  throw "Failed to resolve release tag from GitHub release page."
}

function Test-RemoteUriExists {
  param(
    [string]$Uri,
    [string]$Label
  )

  try {
    Invoke-WebRequest -Headers (Get-GitHubHeaders) -Method Head -MaximumRedirection 0 -Uri $Uri | Out-Null
    return $true
  } catch {
    $statusCode = $null
    if ($_.Exception.Response) {
      $statusCode = [int]$_.Exception.Response.StatusCode
    }

    if ($statusCode -in 200, 301, 302, 303, 307, 308) {
      return $true
    }

    if ($statusCode -eq 404) {
      return $false
    }

    Write-Step "Remote probe for $Label failed; treating it as unavailable."
    return $false
  }
}

function Get-ReleaseVersionNumberFromTag {
  param([string]$TagName)

  if ([string]::IsNullOrWhiteSpace($TagName)) {
    return ""
  }
  if ($TagName.StartsWith("v")) {
    return $TagName.Substring(1)
  }
  return $TagName
}

function Get-InstallPayloadKindFromRoot {
  param([string]$SourceRoot)

  if (Test-Path (Join-Path $SourceRoot "README-release-light.md") -PathType Leaf) {
    return "release-light"
  }
  return "source"
}

function Resolve-RemoteInstallPayloadPlan {
  param(
    [object]$Release,
    [string]$Owner,
    [string]$Name
  )

  $tagName = [string]$Release.tag_name
  $versionNumber = Get-ReleaseVersionNumberFromTag -TagName $tagName
  $assetName = if ([string]::IsNullOrWhiteSpace($versionNumber)) {
    $null
  } else {
    "star-sanctuary-dist-v$versionNumber.zip"
  }

  if ($assetName -and $Release.assets) {
    $asset = @($Release.assets | Where-Object { $_.name -eq $assetName } | Select-Object -First 1)
    if ($asset.Count -gt 0 -and -not [string]::IsNullOrWhiteSpace([string]$asset[0].browser_download_url)) {
      return @{
        kind = "release-light"
        sourceType = "github-release-light"
        archiveUrl = [string]$asset[0].browser_download_url
        downloadLabel = "GitHub release-light archive"
        extractLabel = "release-light archive"
      }
    }
  }

  if (-not [string]::IsNullOrWhiteSpace([string]$Release.zipball_url)) {
    return @{
      kind = "source"
      sourceType = "github-release-source"
      archiveUrl = [string]$Release.zipball_url
      downloadLabel = "GitHub release source archive"
      extractLabel = "source archive"
    }
  }

  throw "The selected release does not expose a usable release-light asset or source zipball."
}

function Resolve-RemoteInstallPayloadPlanFromTag {
  param(
    [string]$Owner,
    [string]$Name,
    [string]$TagName,
    [string]$RequestedVersion
  )

  $versionNumber = Get-ReleaseVersionNumberFromTag -TagName $TagName
  if ([string]::IsNullOrWhiteSpace($versionNumber)) {
    throw "Failed to resolve release version number from tag."
  }

  $assetName = "star-sanctuary-dist-v$versionNumber.zip"
  $normalizedVersion = Normalize-Version -RawVersion $RequestedVersion
  $assetUrl = if ($normalizedVersion -eq "latest") {
    "https://github.com/$Owner/$Name/releases/latest/download/$assetName"
  } else {
    "https://github.com/$Owner/$Name/releases/download/$TagName/$assetName"
  }

  if (Test-RemoteUriExists -Uri $assetUrl -Label "release-light asset $assetName") {
    return @{
      kind = "release-light"
      sourceType = "github-release-light"
      archiveUrl = $assetUrl
      downloadLabel = "GitHub release-light archive"
      extractLabel = "release-light archive"
    }
  }

  $sourceUrl = "https://github.com/$Owner/$Name/archive/refs/tags/$TagName.zip"
  if (Test-RemoteUriExists -Uri $sourceUrl -Label "source archive $TagName") {
    return @{
      kind = "source"
      sourceType = "github-release-source"
      archiveUrl = $sourceUrl
      downloadLabel = "GitHub release source archive"
      extractLabel = "source archive"
    }
  }

  throw "The selected release does not expose a usable release-light asset or source zipball."
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
if exist "%FIRST_START_NOTICE%" (
echo [Star Sanctuary Launcher] Post-install note:
type "%FIRST_START_NOTICE%"
del /f /q "%FIRST_START_NOTICE%" >nul 2>nul
echo.
)
if not defined AUTO_OPEN_BROWSER set "AUTO_OPEN_BROWSER=true"
if /I "%CI%"=="true" set "AUTO_OPEN_BROWSER=false"
echo [Star Sanctuary Launcher] Starting Gateway...
echo [Star Sanctuary Launcher] WebChat: http://localhost:28889
echo.
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
if (Test-Path $noticePath) {
  Write-Host '[Star Sanctuary Launcher] Post-install note:'
  Get-Content -LiteralPath $noticePath
  Remove-Item -LiteralPath $noticePath -Force -ErrorAction SilentlyContinue
  Write-Host ''
}
if ([string]::IsNullOrWhiteSpace($env:AUTO_OPEN_BROWSER)) {
  $env:AUTO_OPEN_BROWSER = if ($env:CI -eq 'true') { 'false' } else { 'true' }
} elseif ($env:CI -eq 'true') {
  $env:AUTO_OPEN_BROWSER = 'false'
}
Write-Host '[Star Sanctuary Launcher] Starting Gateway...'
Write-Host '[Star Sanctuary Launcher] WebChat: http://localhost:28889'
Write-Host ''
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
    [string]$Name,
    [string]$SourceType
  )

  $payload = @{
    productName = "Star Sanctuary"
    tag = $TagName
    version = $VersionName
    source = @{
      type = $SourceType
      owner = $Owner
      repo = $Name
    }
    installedAt = [DateTimeOffset]::UtcNow.ToString("o")
    currentDir = "current"
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

function Resolve-InstallerStateDir {
  $homeDir = $HOME
  if ([string]::IsNullOrWhiteSpace($homeDir)) {
    $homeDir = $env:USERPROFILE
  }
  if ([string]::IsNullOrWhiteSpace($homeDir)) {
    throw "Unable to resolve home directory for state dir."
  }

  function Resolve-ExplicitStateDir {
    param(
      [string]$RawPath,
      [string]$ResolvedHomeDir
    )

    if ([string]::IsNullOrWhiteSpace($RawPath)) {
      return $null
    }

    $trimmed = $RawPath.Trim()
    if ($trimmed -eq "~") {
      return [System.IO.Path]::GetFullPath($ResolvedHomeDir)
    }
    if ($trimmed.StartsWith("~/") -or $trimmed.StartsWith('~\')) {
      return [System.IO.Path]::GetFullPath((Join-Path $ResolvedHomeDir $trimmed.Substring(2)))
    }
    return [System.IO.Path]::GetFullPath($trimmed)
  }

  if (-not [string]::IsNullOrWhiteSpace($env:BELLDANDY_STATE_DIR_WINDOWS)) {
    return Resolve-ExplicitStateDir -RawPath $env:BELLDANDY_STATE_DIR_WINDOWS -ResolvedHomeDir $homeDir
  }
  if (-not [string]::IsNullOrWhiteSpace($env:BELLDANDY_STATE_DIR)) {
    return Resolve-ExplicitStateDir -RawPath $env:BELLDANDY_STATE_DIR -ResolvedHomeDir $homeDir
  }

  $preferred = Join-Path $homeDir ".star_sanctuary"
  if (Test-Path $preferred) {
    return [System.IO.Path]::GetFullPath($preferred)
  }

  $legacy = Join-Path $homeDir ".belldandy"
  if (Test-Path $legacy) {
    return [System.IO.Path]::GetFullPath($legacy)
  }

  return [System.IO.Path]::GetFullPath($preferred)
}

function Get-SetupPlan {
  param(
    [string]$InstallRoot,
    [string]$StateDir,
    [switch]$NoSetup,
    [switch]$ForceSetup
  )

  $envLocalPath = Join-Path $StateDir ".env.local"
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
  $iconPath = Join-Path $InstallRoot "current\apps\web\public\logo06-256.ico"

  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($shortcutPath)
  $shortcut.TargetPath = $targetPath
  $shortcut.WorkingDirectory = $workingDir
  $shortcut.Description = "Start Star Sanctuary"
  if (Test-Path $iconPath -PathType Leaf) {
    $shortcut.IconLocation = $iconPath
  } else {
    Write-Step "Shortcut icon was not found at $iconPath. Creating desktop shortcut without a custom icon."
  }
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
$resolvedStateDir = Resolve-InstallerStateDir

try {
  Ensure-NodeRuntime
  $localSourceRoot = $null
  $release = $null
  $resolvedTag = $null
  $versionName = $null
  $installPayloadKind = $null
  $installSourceType = $null
  $remotePayloadPlan = $null
  $normalizedVersion = Normalize-Version -RawVersion $Version

  if (-not [string]::IsNullOrWhiteSpace($SourceDir)) {
    $localSourceRoot = [System.IO.Path]::GetFullPath($SourceDir)
    if (-not (Test-Path $localSourceRoot -PathType Container)) {
      throw "SourceDir was not found: $localSourceRoot"
    }

    $installPayloadKind = Get-InstallPayloadKindFromRoot -SourceRoot $localSourceRoot
    $installSourceType = if ($installPayloadKind -eq "release-light") { "local-release-light" } else { "local-source" }
    $resolvedTag = if ($normalizedVersion -eq "latest") { $installSourceType } else { $normalizedVersion }
    $versionName = $resolvedTag
    Write-Step "Using local $installPayloadKind override from $localSourceRoot"
  } else {
    try {
      $release = Get-ReleaseMetadata -Owner $RepoOwner -Name $RepoName -RequestedVersion $Version
    } catch {
      Write-Step "GitHub API release metadata fetch failed; falling back to GitHub release page resolution. Set GITHUB_TOKEN to raise API rate limits when available."
    }

    if ($release) {
      $resolvedTag = [string]$release.tag_name
      if ([string]::IsNullOrWhiteSpace($resolvedTag)) {
        throw "Failed to resolve release tag from GitHub metadata."
      }

      $versionName = (([string]$release.name).Trim())
      if ([string]::IsNullOrWhiteSpace($versionName)) {
        $versionName = $resolvedTag
      }
      $remotePayloadPlan = Resolve-RemoteInstallPayloadPlan -Release $release -Owner $RepoOwner -Name $RepoName
    } else {
      $resolvedTag = Resolve-ReleaseTagFromPage -Owner $RepoOwner -Name $RepoName -RequestedVersion $Version
      $versionName = $resolvedTag
      $remotePayloadPlan = Resolve-RemoteInstallPayloadPlanFromTag -Owner $RepoOwner -Name $RepoName -TagName $resolvedTag -RequestedVersion $Version
    }

    $installPayloadKind = [string]$remotePayloadPlan.kind
    $installSourceType = [string]$remotePayloadPlan.sourceType
  }

  Write-Step "Installing Star Sanctuary $resolvedTag into $installRoot"

  $sourceRoot = $null
  if ($localSourceRoot) {
    $sourceRoot = Get-Item -LiteralPath $localSourceRoot
  } else {
    $archivePath = Join-Path $tempRoot "source.zip"
    $extractRoot = Join-Path $tempRoot "extract"
    New-Item -ItemType Directory -Path $extractRoot | Out-Null

    Write-Step "Downloading $($remotePayloadPlan.downloadLabel)"
    Invoke-WebRequest -Headers (Get-GitHubHeaders) -Uri $remotePayloadPlan.archiveUrl -OutFile $archivePath

    Write-Step "Extracting $($remotePayloadPlan.extractLabel)"
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
      if ($installPayloadKind -eq "release-light") {
        Write-Step "Installing production workspace dependencies from release-light package"
        & corepack pnpm install --prod --frozen-lockfile
        if ($LASTEXITCODE -ne 0) {
          throw "corepack pnpm install failed."
        }
      } else {
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
    }
  } else {
    Write-Step "Skipping dependency install/build (-SkipInstallBuild)"
  }

  Write-WindowsWrappers -Root $installRoot
  Write-InstallMetadata -Root $installRoot -TagName $resolvedTag -VersionName $versionName -Owner $RepoOwner -Name $RepoName -SourceType $installSourceType

  if (-not $NoDesktopShortcut) {
    New-DesktopShortcut -InstallRoot $installRoot
  }

  $setupPlan = Get-SetupPlan -InstallRoot $installRoot -StateDir $resolvedStateDir -NoSetup:$NoSetup -ForceSetup:$ForceSetup
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
