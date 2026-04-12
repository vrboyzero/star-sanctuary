#!/usr/bin/env bash
set -euo pipefail

VERSION="latest"
INSTALL_DIR=""
REPO_OWNER="${STAR_SANCTUARY_REPO_OWNER:-vrboyzero}"
REPO_NAME="${STAR_SANCTUARY_REPO_NAME:-star-sanctuary}"
NO_SETUP=0

MIN_NODE_MAJOR=22
MIN_NODE_MINOR=12

log() {
  printf '[install] %s\n' "$1"
}

fail() {
  printf '[install] ERROR: %s\n' "$1" >&2
  exit 1
}

cleanup() {
  if [[ -n "${TEMP_ROOT:-}" && -d "${TEMP_ROOT:-}" ]]; then
    rm -rf "${TEMP_ROOT}"
  fi
  if [[ "${INSTALL_SUCCEEDED:-0}" -ne 1 && -n "${CURRENT_ROOT:-}" && -d "${CURRENT_ROOT:-}" ]]; then
    rm -rf "${CURRENT_ROOT}"
    if [[ -n "${BACKUP_PATH:-}" && -d "${BACKUP_PATH:-}" ]]; then
      mv "${BACKUP_PATH}" "${CURRENT_ROOT}"
    fi
  fi
}

trap cleanup EXIT

while [[ $# -gt 0 ]]; do
  case "$1" in
    --version)
      VERSION="${2:-}"
      shift 2
      ;;
    --install-dir)
      INSTALL_DIR="${2:-}"
      shift 2
      ;;
    --repo-owner)
      REPO_OWNER="${2:-}"
      shift 2
      ;;
    --repo-name)
      REPO_NAME="${2:-}"
      shift 2
      ;;
    --no-setup)
      NO_SETUP=1
      shift
      ;;
    *)
      fail "Unknown argument: $1"
      ;;
  esac
done

ensure_command() {
  local name="$1"
  local message="$2"
  command -v "$name" >/dev/null 2>&1 || fail "$message"
}

normalize_version() {
  local raw="$1"
  if [[ -z "$raw" || "$raw" == "latest" ]]; then
    printf 'latest'
    return 0
  fi
  if [[ "$raw" == v* ]]; then
    printf '%s' "$raw"
    return 0
  fi
  printf 'v%s' "$raw"
}

ensure_node_runtime() {
  ensure_command node "Node.js was not found. Install Node.js v22.12+ first."
  ensure_command corepack "corepack was not found. Install a Node.js distribution that includes corepack."
  ensure_command curl "curl was not found."
  ensure_command tar "tar was not found."

  local node_version
  node_version="$(node -p "process.versions.node")" || fail "Failed to detect Node.js version."

  local major minor
  major="$(printf '%s' "$node_version" | cut -d. -f1)"
  minor="$(printf '%s' "$node_version" | cut -d. -f2)"

  if (( major < MIN_NODE_MAJOR )) || (( major == MIN_NODE_MAJOR && minor < MIN_NODE_MINOR )); then
    fail "Node.js v${node_version} is too old. Install Node.js v22.12+ first."
  fi

  log "Detected Node.js v${node_version}"
}

github_headers=()
if [[ -n "${GITHUB_TOKEN:-}" ]]; then
  github_headers=(-H "Authorization: Bearer ${GITHUB_TOKEN}")
fi

release_endpoint() {
  local normalized
  normalized="$(normalize_version "$VERSION")"
  if [[ "$normalized" == "latest" ]]; then
    printf 'https://api.github.com/repos/%s/%s/releases/latest' "$REPO_OWNER" "$REPO_NAME"
  else
    printf 'https://api.github.com/repos/%s/%s/releases/tags/%s' "$REPO_OWNER" "$REPO_NAME" "$normalized"
  fi
}

direct_archive_url() {
  local normalized
  normalized="$(normalize_version "$VERSION")"
  printf 'https://github.com/%s/%s/archive/refs/tags/%s.tar.gz' "$REPO_OWNER" "$REPO_NAME" "$normalized"
}

json_read() {
  local expression="$1"
  node -e "
const fs = require('fs');
const data = JSON.parse(fs.readFileSync(0, 'utf8'));
const value = ${expression};
if (value === undefined || value === null) process.exit(1);
if (typeof value === 'string') process.stdout.write(value);
else process.stdout.write(JSON.stringify(value));
"
}

write_unix_wrappers() {
  local root="$1"

  cat > "${root}/start.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export STAR_SANCTUARY_RUNTIME_MODE="source"
export BELLDANDY_RUNTIME_MODE="source"
export STAR_SANCTUARY_RUNTIME_DIR="${SCRIPT_DIR}/current"
export BELLDANDY_RUNTIME_DIR="${SCRIPT_DIR}/current"
export STAR_SANCTUARY_ENV_DIR="${SCRIPT_DIR}"
export BELLDANDY_ENV_DIR="${SCRIPT_DIR}"
exec node "${SCRIPT_DIR}/current/packages/belldandy-core/dist/bin/bdd.js" start "$@"
EOF

  cat > "${root}/bdd" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export STAR_SANCTUARY_RUNTIME_MODE="source"
export BELLDANDY_RUNTIME_MODE="source"
export STAR_SANCTUARY_RUNTIME_DIR="${SCRIPT_DIR}/current"
export BELLDANDY_RUNTIME_DIR="${SCRIPT_DIR}/current"
export STAR_SANCTUARY_ENV_DIR="${SCRIPT_DIR}"
export BELLDANDY_ENV_DIR="${SCRIPT_DIR}"
exec node "${SCRIPT_DIR}/current/packages/belldandy-core/dist/bin/bdd.js" "$@"
EOF

  chmod +x "${root}/start.sh" "${root}/bdd"
}

write_install_metadata() {
  local root="$1"
  local tag="$2"
  local release_name="$3"

  node -e "
const fs = require('fs');
const path = process.argv[1];
  const payload = {
    productName: 'Star Sanctuary',
    tag: process.argv[2],
    version: process.argv[3],
  source: {
    type: 'github-release-source',
    owner: process.argv[4],
    repo: process.argv[5],
    },
    installedAt: new Date().toISOString(),
    currentDir: 'current',
    envDir: '.',
    entrypoints: {
      startSh: 'start.sh',
      bdd: 'bdd',
  },
};
fs.writeFileSync(path, JSON.stringify(payload, null, 2) + '\n');
" "${root}/install-info.json" "${tag}" "${release_name}" "${REPO_OWNER}" "${REPO_NAME}"
}

if [[ -z "$INSTALL_DIR" ]]; then
  if [[ -n "${XDG_DATA_HOME:-}" ]]; then
    INSTALL_DIR="${XDG_DATA_HOME}/star-sanctuary"
  else
    INSTALL_DIR="${HOME}/.local/share/star-sanctuary"
  fi
fi

mkdir -p "$(dirname "$INSTALL_DIR")"
mkdir -p "$INSTALL_DIR"
INSTALL_ROOT="$(cd "$INSTALL_DIR" && pwd)"
CURRENT_ROOT="${INSTALL_ROOT}/current"
BACKUP_ROOT="${INSTALL_ROOT}/backups"
TEMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/star-sanctuary-install-XXXXXX")"
BACKUP_PATH=""
INSTALL_SUCCEEDED=0

ensure_node_runtime

ENDPOINT="$(release_endpoint)"
if [[ "$(normalize_version "$VERSION")" == "latest" ]]; then
  log "Fetching release metadata from ${ENDPOINT}"
  RELEASE_JSON="$(curl -fsSL -H 'Accept: application/vnd.github+json' -H 'User-Agent: Star-Sanctuary-Installer' "${github_headers[@]}" "${ENDPOINT}")" \
    || fail "Failed to fetch GitHub release metadata."

  TAG_NAME="$(printf '%s' "$RELEASE_JSON" | json_read 'data.tag_name')" || fail "Failed to resolve release tag."
  ARCHIVE_URL="$(printf '%s' "$RELEASE_JSON" | json_read 'data.tarball_url')" || fail "The selected release does not expose a GitHub source tarball."
  RELEASE_NAME="$(printf '%s' "$RELEASE_JSON" | json_read 'data.name || data.tag_name')" || fail "Failed to resolve release name."
else
  TAG_NAME="$(normalize_version "$VERSION")"
  ARCHIVE_URL="$(direct_archive_url)"
  RELEASE_NAME="${TAG_NAME}"
fi

log "Installing Star Sanctuary ${TAG_NAME} into ${INSTALL_ROOT}"

ARCHIVE_PATH="${TEMP_ROOT}/source.tar.gz"
EXTRACT_ROOT="${TEMP_ROOT}/extract"
mkdir -p "${EXTRACT_ROOT}"

log "Downloading GitHub release source archive"
curl -fsSL -H 'User-Agent: Star-Sanctuary-Installer' "${github_headers[@]}" "${ARCHIVE_URL}" -o "${ARCHIVE_PATH}" \
  || fail "Failed to download GitHub source archive."

log "Extracting source archive"
tar -xzf "${ARCHIVE_PATH}" -C "${EXTRACT_ROOT}" || fail "Failed to extract source archive."

SOURCE_ROOT="$(find "${EXTRACT_ROOT}" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
[[ -n "${SOURCE_ROOT}" ]] || fail "Failed to locate extracted source root."

mkdir -p "${INSTALL_ROOT}" "${BACKUP_ROOT}"
if [[ -d "${CURRENT_ROOT}" ]]; then
  BACKUP_PATH="${BACKUP_ROOT}/current-$(date +%Y%m%d-%H%M%S)"
  log "Backing up existing installation to ${BACKUP_PATH}"
  mv "${CURRENT_ROOT}" "${BACKUP_PATH}"
fi

log "Promoting extracted source tree into current/"
mv "${SOURCE_ROOT}" "${CURRENT_ROOT}"

PACKAGE_MANAGER="$(node -e "const fs=require('fs');const path=require('path');const pkg=JSON.parse(fs.readFileSync(path.join(process.argv[1],'package.json'),'utf8'));process.stdout.write(pkg.packageManager || 'pnpm@10');" "${CURRENT_ROOT}")" \
  || fail "Failed to resolve packageManager from package.json."

log "Activating ${PACKAGE_MANAGER} via corepack"
corepack prepare "${PACKAGE_MANAGER}" --activate >/dev/null || fail "corepack prepare ${PACKAGE_MANAGER} failed."

(
  cd "${CURRENT_ROOT}"
  log "Installing workspace dependencies"
  corepack pnpm install || fail "corepack pnpm install failed."

  log "Building workspace"
  corepack pnpm build || fail "corepack pnpm build failed."
)
if [[ -f "${CURRENT_ROOT}/start.sh" ]]; then
  chmod +x "${CURRENT_ROOT}/start.sh"
fi

write_unix_wrappers "${INSTALL_ROOT}"
write_install_metadata "${INSTALL_ROOT}" "${TAG_NAME}" "${RELEASE_NAME}"

if [[ "${NO_SETUP}" -eq 0 ]]; then
  log "Launching bdd setup"
  "${INSTALL_ROOT}/bdd" setup || fail "'bdd setup' failed."
else
  log "Skipping bdd setup (--no-setup)"
fi

log "Install complete."
printf '  Install root: %s\n' "${INSTALL_ROOT}"
printf '  Start:        %s\n' "${INSTALL_ROOT}/start.sh"
printf '  CLI:          %s\n' "${INSTALL_ROOT}/bdd"
INSTALL_SUCCEEDED=1
