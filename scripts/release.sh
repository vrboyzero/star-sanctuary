#!/usr/bin/env bash
set -euo pipefail

REMOTE="${RELEASE_REMOTE:-origin}"
BRANCH="${RELEASE_BRANCH:-main}"

if [[ $# -ne 1 ]]; then
  echo "Usage: scripts/release.sh <version>"
  echo "Example: scripts/release.sh 0.1.2"
  echo "Optional env: RELEASE_REMOTE=origin RELEASE_BRANCH=main"
  exit 1
fi

VERSION="$1"
if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Invalid version: $VERSION (expected SemVer: MAJOR.MINOR.PATCH)"
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree is not clean. Commit or stash changes first."
  exit 1
fi

if [[ ! -f "CHANGELOG.md" ]]; then
  echo "CHANGELOG.md not found."
  exit 1
fi

if ! grep -q "^## \[$VERSION\]" CHANGELOG.md; then
  echo "Missing changelog section: ## [$VERSION]"
  exit 1
fi

if ! git remote get-url "$REMOTE" >/dev/null 2>&1; then
  echo "Release blocked: git remote '$REMOTE' does not exist."
  exit 1
fi

echo "Bumping root version to $VERSION..."
node -e "const fs=require('fs');const p='package.json';const j=JSON.parse(fs.readFileSync(p,'utf8'));j.version='$VERSION';fs.writeFileSync(p,JSON.stringify(j,null,2)+'\n');"

echo "Generating version file..."
pnpm run version:generate

echo "Creating release commit/tag..."
git add package.json CHANGELOG.md
git commit -m "release: v$VERSION"
git tag "v$VERSION"

echo "Pushing to $REMOTE/$BRANCH with tags..."
git push "$REMOTE" "$BRANCH" --tags

echo "Release v$VERSION completed."
