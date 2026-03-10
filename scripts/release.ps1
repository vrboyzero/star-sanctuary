param(
  [Parameter(Mandatory = $true)]
  [string]$Version,
  [string]$Branch = "main",
  [switch]$DryRun,
  [switch]$SkipCleanCheck
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Step {
  param([string]$Message)
  Write-Host "[release] $Message"
}

function Invoke-Checked {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Description,
    [Parameter(Mandatory = $true)]
    [scriptblock]$Action
  )
  Write-Step $Description
  & $Action
}

function Invoke-Git {
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$Args
  )
  & git @Args
  if ($LASTEXITCODE -ne 0) {
    throw "git command failed: git $($Args -join ' ')"
  }
}

function Invoke-Node {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Script
  )
  & node -e $Script
  if ($LASTEXITCODE -ne 0) {
    throw "node command failed"
  }
}

if ($Version -notmatch '^\d+\.\d+\.\d+$') {
  throw "Invalid version '$Version'. Expected SemVer: MAJOR.MINOR.PATCH"
}
if ([string]::IsNullOrWhiteSpace($Branch)) {
  throw "Invalid branch name."
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptDir "..")

Push-Location $repoRoot
try {
  if (-not (Test-Path "package.json")) {
    throw "package.json not found under repo root: $repoRoot"
  }
  if (-not (Test-Path "CHANGELOG.md")) {
    throw "CHANGELOG.md not found."
  }

  Get-Command git -ErrorAction Stop | Out-Null
  Get-Command node -ErrorAction Stop | Out-Null
  Get-Command corepack -ErrorAction Stop | Out-Null

  $currentBranch = (& git rev-parse --abbrev-ref HEAD).Trim()
  if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($currentBranch)) {
    throw "Failed to resolve current git branch."
  }
  if ($currentBranch -ne $Branch) {
    throw "Release blocked: current branch is '$currentBranch', expected '$Branch'. Use -Branch to override explicitly."
  }

  $changelog = Get-Content -LiteralPath "CHANGELOG.md" -Raw
  $changelogPattern = "(?m)^## \[$([regex]::Escape($Version))\]"
  if ($changelog -notmatch $changelogPattern) {
    throw "Missing changelog section: ## [$Version]"
  }

  $dirty = (& git status --porcelain)
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to read git status."
  }
  if (-not $SkipCleanCheck -and $dirty) {
    throw "Working tree is not clean. Commit or stash changes first. (Use -SkipCleanCheck for dry-run rehearsal only.)"
  }

  if ($DryRun) {
    Write-Step "Dry-run mode enabled. No files will be modified and no git push will occur."
    Write-Step "[DRY-RUN] Update root package version -> $Version"
    Write-Step "[DRY-RUN] corepack pnpm run version:generate"
    Write-Step "[DRY-RUN] git add package.json CHANGELOG.md"
    Write-Step "[DRY-RUN] git commit -m ""release: v$Version"""
    Write-Step "[DRY-RUN] git tag v$Version"
    Write-Step "[DRY-RUN] git push star $Branch --tags"
    Write-Step "Dry-run completed."
    exit 0
  }

  Invoke-Checked "Bump root package version to $Version" {
    $nodeScript = "const fs=require('fs');const p='package.json';const j=JSON.parse(fs.readFileSync(p,'utf8'));j.version='$Version';fs.writeFileSync(p, JSON.stringify(j,null,2)+'\n');"
    Invoke-Node -Script $nodeScript
  }

  Invoke-Checked "Generate version file" {
    & corepack pnpm run version:generate
    if ($LASTEXITCODE -ne 0) {
      throw "corepack pnpm run version:generate failed"
    }
  }

  Invoke-Checked "Create release commit" {
    Invoke-Git -Args @("add", "package.json", "CHANGELOG.md")
    Invoke-Git -Args @("commit", "-m", "release: v$Version")
  }

  Invoke-Checked "Create git tag" {
    Invoke-Git -Args @("tag", "v$Version")
  }

  Invoke-Checked "Push $Branch branch with tags" {
    Invoke-Git -Args @("push", "star", $Branch, "--tags")
  }

  Write-Step "Release v$Version completed."
} finally {
  Pop-Location
}
