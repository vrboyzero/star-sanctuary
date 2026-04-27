#!/usr/bin/env bash
set -euo pipefail

VERSION="latest"
INSTALL_DIR=""
REPO_OWNER="${STAR_SANCTUARY_REPO_OWNER:-vrboyzero}"
REPO_NAME="${STAR_SANCTUARY_REPO_NAME:-star-sanctuary}"
SOURCE_DIR=""
SKIP_INSTALL_BUILD=0
NO_SETUP=0
FORCE_SETUP=0

MIN_NODE_MAJOR=22
MIN_NODE_MINOR=12
FIRST_START_NOTICE_FILE="first-start-notice.txt"

log() {
  printf '[install] %s\n' "$1"
}

fail() {
  local message="$1"
  printf '[install] ERROR: %s\n' "$message" >&2
  case "$message" in
    *"Node.js was not found."*|*"Node.js v"*' is too old. Install Node.js v22.12+ first.'*|*"Failed to detect Node.js version."*)
      printf '[install] HINT: Use Node.js v22.12+ LTS, then reopen the terminal so node/corepack are available on PATH.\n' >&2
      ;;
  esac
  case "$message" in
    *"corepack was not found."*|*"corepack prepare "*' failed.'*)
      printf '[install] HINT: Install or repair a Node.js distribution that includes corepack, then rerun the installer.\n' >&2
      ;;
  esac
  case "$message" in
    *"corepack pnpm install failed."*|*"corepack pnpm build failed."*)
      printf '[install] HINT: Default install/start does not require optional native features like node-pty, fastembed, protobufjs, or onnxruntime-node.\n' >&2
      printf '[install] HINT: A plain "pnpm approve-builds" reminder is not a blocker for the default install/build path.\n' >&2
      printf '[install] HINT: If the log mentions better-sqlite3, native bindings, ABI, or postinstall failures, switch to Node.js v22.12+ LTS and rerun.\n' >&2
      printf '[install] HINT: If the log mentions registry, tarball, ECONNRESET, ETIMEDOUT, or proxy access, fix network/registry access and rerun.\n' >&2
      ;;
  esac
  case "$message" in
    *"'bdd setup' failed."*)
      printf '[install] HINT: Install/build already completed. Fix the setup issue and rerun %s/bdd setup, or rerun the installer with --force-setup.\n' "${INSTALL_ROOT:-<install-root>}" >&2
      ;;
  esac
  exit 1
}

cleanup() {
  if [[ -n "${TEMP_ROOT:-}" && -d "${TEMP_ROOT:-}" ]]; then
    if [[ "${INSTALL_SUCCEEDED:-0}" -ne 1 ]]; then
      if [[ -n "${CURRENT_ROOT:-}" && -e "${CURRENT_ROOT:-}" ]]; then
        rm -rf "${CURRENT_ROOT}"
      fi
      if [[ -n "${BACKUP_PATH:-}" && -e "${BACKUP_PATH:-}" ]]; then
        mv "${BACKUP_PATH}" "${CURRENT_ROOT}"
      fi
      if [[ -n "${INSTALL_ROOT:-}" && -n "${INSTALL_ROOT_FILES_BACKUP_DIR:-}" ]]; then
        restore_install_root_files "${INSTALL_ROOT}" "${INSTALL_ROOT_FILES_BACKUP_DIR}" "${MANAGED_INSTALL_FILES[@]}"
      fi
    fi
    rm -rf "${TEMP_ROOT}"
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
    --source-dir)
      SOURCE_DIR="${2:-}"
      shift 2
      ;;
    --skip-install-build)
      SKIP_INSTALL_BUILD=1
      shift
      ;;
    --no-setup)
      NO_SETUP=1
      shift
      ;;
    --force-setup)
      FORCE_SETUP=1
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

new_source_symlink() {
  local link_path="$1"
  local target_path="$2"
  ln -s "${target_path}" "${link_path}"
}

copy_source_tree() {
  local source_root="$1"
  local target_root="$2"
  mkdir -p "${target_root}"
  cp -a "${source_root}/." "${target_root}/"
}

run_test_fail_point() {
  local point="$1"
  if [[ "${STAR_SANCTUARY_INSTALL_TEST_FAIL_AT:-}" == "${point}" ]]; then
    fail "Installer test failpoint triggered at ${point}."
  fi
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

release_version_number_from_tag() {
  local tag="$1"
  if [[ "$tag" == v* ]]; then
    printf '%s' "${tag#v}"
    return 0
  fi
  printf '%s' "$tag"
}

detect_install_payload_kind() {
  local source_root="$1"
  if [[ -f "${source_root}/README-release-light.md" ]]; then
    printf 'release-light'
    return 0
  fi
  printf 'source'
}

resolve_remote_install_payload_plan() {
  local release_json="$1"
  local tag_name="$2"
  local version_number asset_name asset_url source_url

  version_number="$(release_version_number_from_tag "$tag_name")"
  asset_name="star-sanctuary-dist-v${version_number}.tar.gz"
  asset_url="$(printf '%s' "$release_json" | json_read "(() => { const assets = Array.isArray(data.assets) ? data.assets : []; const hit = assets.find((item) => item && item.name === ${asset_name@Q}); return hit ? hit.browser_download_url : ''; })()")" || asset_url=""
  if [[ -n "${asset_url}" ]]; then
    printf 'release-light|github-release-light|%s|GitHub release-light archive|release-light archive' "${asset_url}"
    return 0
  fi

  source_url="$(printf '%s' "$release_json" | json_read 'data.tarball_url || ""')" || source_url=""
  if [[ -n "${source_url}" ]]; then
    printf 'source|github-release-source|%s|GitHub release source archive|source archive' "${source_url}"
    return 0
  fi

  fail "The selected release does not expose a usable release-light asset or source tarball."
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
NOTICE_FILE="${SCRIPT_DIR}/first-start-notice.txt"
export STAR_SANCTUARY_RUNTIME_MODE="source"
export BELLDANDY_RUNTIME_MODE="source"
export STAR_SANCTUARY_RUNTIME_DIR="${SCRIPT_DIR}/current"
export BELLDANDY_RUNTIME_DIR="${SCRIPT_DIR}/current"
if [[ -f "${NOTICE_FILE}" ]]; then
  echo "[Star Sanctuary Launcher] Post-install note:"
  cat "${NOTICE_FILE}"
  rm -f "${NOTICE_FILE}"
  echo ""
fi
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
exec node "${SCRIPT_DIR}/current/packages/belldandy-core/dist/bin/bdd.js" "$@"
EOF

  chmod +x "${root}/start.sh" "${root}/bdd"
}

backup_install_root_files() {
  local root="$1"
  local backup_dir="$2"
  shift 2
  mkdir -p "${backup_dir}"
  for file in "$@"; do
    local source_path="${root}/${file}"
    local backup_path="${backup_dir}/${file}"
    if [[ -f "${source_path}" ]]; then
      mkdir -p "$(dirname "${backup_path}")"
      cp "${source_path}" "${backup_path}"
    fi
  done
}

restore_install_root_files() {
  local root="$1"
  local backup_dir="$2"
  shift 2
  for file in "$@"; do
    local target_path="${root}/${file}"
    local backup_path="${backup_dir}/${file}"
    if [[ -f "${backup_path}" ]]; then
      cp "${backup_path}" "${target_path}"
    elif [[ -e "${target_path}" ]]; then
      rm -f "${target_path}"
    fi
  done
}

resolve_state_dir() {
  local home_dir="${HOME}"
  local uname_value
  uname_value="$(uname -s 2>/dev/null || printf '')"

  if [[ "${uname_value}" == "Linux" && -n "${BELLDANDY_STATE_DIR_WSL:-}" && ( -n "${WSL_DISTRO_NAME:-}" || -n "${WSL_INTEROP:-}" ) ]]; then
    printf '%s' "${BELLDANDY_STATE_DIR_WSL/#\~/${home_dir}}"
    return 0
  fi

  if [[ -n "${BELLDANDY_STATE_DIR:-}" ]]; then
    printf '%s' "${BELLDANDY_STATE_DIR/#\~/${home_dir}}"
    return 0
  fi

  if [[ -d "${home_dir}/.star_sanctuary" ]]; then
    printf '%s' "${home_dir}/.star_sanctuary"
    return 0
  fi

  if [[ -d "${home_dir}/.belldandy" ]]; then
    printf '%s' "${home_dir}/.belldandy"
    return 0
  fi

  printf '%s' "${home_dir}/.star_sanctuary"
}

get_setup_step_message() {
  local install_root="$1"
  local state_dir="$2"
  local env_local_path="${state_dir}/.env.local"

  if [[ "${NO_SETUP}" -eq 1 ]]; then
    printf 'Skipping bdd setup (--no-setup)'
    return 0
  fi

  if [[ "${FORCE_SETUP}" -eq 1 ]]; then
    printf 'Launching bdd setup (--force-setup)'
    return 0
  fi

  if [[ -f "${env_local_path}" ]]; then
    printf 'Detected existing .env.local at %s; skipping bdd setup for upgrade handoff' "${env_local_path}"
    return 0
  fi

  printf 'Launching bdd setup'
}

get_setup_summary() {
  local install_root="$1"
  local state_dir="$2"
  local env_local_path="${state_dir}/.env.local"

  if [[ "${NO_SETUP}" -eq 1 ]]; then
    printf 'skipped by --no-setup; run %s/bdd setup when you are ready to refresh config' "${install_root}"
    return 0
  fi

  if [[ "${FORCE_SETUP}" -eq 1 ]]; then
    printf 're-ran during install (--force-setup)'
    return 0
  fi

  if [[ -f "${env_local_path}" ]]; then
    printf 'skipped by default because existing .env.local was preserved; run %s/bdd setup or rerun installer with --force-setup to refresh config' "${install_root}"
    return 0
  fi

  printf 'completed during install'
}

get_first_start_summary() {
  local install_root="$1"
  local state_dir="$2"
  local env_local_path="${state_dir}/.env.local"

  if [[ "${NO_SETUP}" -eq 1 || "${FORCE_SETUP}" -eq 1 ]]; then
    return 0
  fi

  if [[ -f "${env_local_path}" ]]; then
    printf 'will reuse preserved .env.local; run %s/bdd setup later if provider/channel/auth config needs refresh' "${install_root}"
  fi
}

should_run_setup() {
  local _install_root="$1"
  local state_dir="$2"
  local env_local_path="${state_dir}/.env.local"

  if [[ "${NO_SETUP}" -eq 1 ]]; then
    return 1
  fi

  if [[ "${FORCE_SETUP}" -eq 1 ]]; then
    return 0
  fi

  if [[ -f "${env_local_path}" ]]; then
    return 1
  fi

  return 0
}

write_install_metadata() {
  local root="$1"
  local tag="$2"
  local release_name="$3"
  local source_type="$4"

  node -e "
const fs = require('fs');
const path = process.argv[1];
  const payload = {
    productName: 'Star Sanctuary',
    tag: process.argv[2],
    version: process.argv[3],
  source: {
    type: process.argv[6],
    owner: process.argv[4],
    repo: process.argv[5],
    },
    installedAt: new Date().toISOString(),
    currentDir: 'current',
    entrypoints: {
      startSh: 'start.sh',
      bdd: 'bdd',
    },
    notices: {
      firstStart: 'first-start-notice.txt',
  },
};
fs.writeFileSync(path, JSON.stringify(payload, null, 2) + '\n');
" "${root}/install-info.json" "${tag}" "${release_name}" "${REPO_OWNER}" "${REPO_NAME}" "${source_type}"
}

write_first_start_notice() {
  local root="$1"
  shift
  local notice_path="${root}/${FIRST_START_NOTICE_FILE}"
  if [[ "$#" -eq 0 ]]; then
    rm -f "${notice_path}"
    return 0
  fi

  {
    for line in "$@"; do
      printf '%s\n' "$line"
    done
  } > "${notice_path}"
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
MANAGED_INSTALL_FILES=("start.sh" "bdd" "install-info.json" "${FIRST_START_NOTICE_FILE}")
INSTALL_ROOT_FILES_BACKUP_DIR="${TEMP_ROOT}/install-root-files-backup"
BACKUP_PATH=""
INSTALL_SUCCEEDED=0
SETUP_STEP_MESSAGE=""
SETUP_SUMMARY=""
FIRST_START_SUMMARY=""
INSTALL_STATE_DIR=""

if [[ "${NO_SETUP}" -eq 1 && "${FORCE_SETUP}" -eq 1 ]]; then
  fail "--no-setup and --force-setup cannot be used together."
fi

ensure_node_runtime

NORMALIZED_VERSION="$(normalize_version "$VERSION")"
INSTALL_PAYLOAD_KIND=""
INSTALL_SOURCE_TYPE=""
REMOTE_PLAN=""
if [[ -n "${SOURCE_DIR}" ]]; then
  SOURCE_DIR="$(cd "${SOURCE_DIR}" && pwd)" || fail "Source dir not found: ${SOURCE_DIR}"
  INSTALL_PAYLOAD_KIND="$(detect_install_payload_kind "${SOURCE_DIR}")"
  if [[ "${INSTALL_PAYLOAD_KIND}" == "release-light" ]]; then
    INSTALL_SOURCE_TYPE="local-release-light"
  else
    INSTALL_SOURCE_TYPE="local-source"
  fi
  TAG_NAME="${NORMALIZED_VERSION}"
  if [[ "${TAG_NAME}" == "latest" ]]; then
    TAG_NAME="${INSTALL_SOURCE_TYPE}"
  fi
  RELEASE_NAME="${TAG_NAME}"
  log "Using local ${INSTALL_PAYLOAD_KIND} override from ${SOURCE_DIR}"
else
  ENDPOINT="$(release_endpoint)"
  log "Fetching release metadata from ${ENDPOINT}"
  RELEASE_JSON="$(curl -fsSL -H 'Accept: application/vnd.github+json' -H 'User-Agent: Star-Sanctuary-Installer' "${github_headers[@]}" "${ENDPOINT}")" \
    || fail "Failed to fetch GitHub release metadata."

  TAG_NAME="$(printf '%s' "$RELEASE_JSON" | json_read 'data.tag_name')" || fail "Failed to resolve release tag."
  RELEASE_NAME="$(printf '%s' "$RELEASE_JSON" | json_read 'data.name || data.tag_name')" || fail "Failed to resolve release name."
  REMOTE_PLAN="$(resolve_remote_install_payload_plan "$RELEASE_JSON" "$TAG_NAME")"
  IFS='|' read -r INSTALL_PAYLOAD_KIND INSTALL_SOURCE_TYPE ARCHIVE_URL DOWNLOAD_LABEL EXTRACT_LABEL <<< "${REMOTE_PLAN}"
fi

log "Installing Star Sanctuary ${TAG_NAME} into ${INSTALL_ROOT}"

if [[ -n "${SOURCE_DIR}" ]]; then
  SOURCE_ROOT="${SOURCE_DIR}"
else
  ARCHIVE_PATH="${TEMP_ROOT}/source.tar.gz"
  EXTRACT_ROOT="${TEMP_ROOT}/extract"
  mkdir -p "${EXTRACT_ROOT}"

  log "Downloading ${DOWNLOAD_LABEL}"
  curl -fsSL -H 'User-Agent: Star-Sanctuary-Installer' "${github_headers[@]}" "${ARCHIVE_URL}" -o "${ARCHIVE_PATH}" \
    || fail "Failed to download ${EXTRACT_LABEL}."

  log "Extracting ${EXTRACT_LABEL}"
  tar -xzf "${ARCHIVE_PATH}" -C "${EXTRACT_ROOT}" || fail "Failed to extract ${EXTRACT_LABEL}."

  SOURCE_ROOT="$(find "${EXTRACT_ROOT}" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
  [[ -n "${SOURCE_ROOT}" ]] || fail "Failed to locate extracted source root."
fi

mkdir -p "${INSTALL_ROOT}" "${BACKUP_ROOT}"
backup_install_root_files "${INSTALL_ROOT}" "${INSTALL_ROOT_FILES_BACKUP_DIR}" "${MANAGED_INSTALL_FILES[@]}"
if [[ -d "${CURRENT_ROOT}" ]]; then
  BACKUP_PATH="${BACKUP_ROOT}/current-$(date +%Y%m%d-%H%M%S)"
  log "Backing up existing installation to ${BACKUP_PATH}"
  mv "${CURRENT_ROOT}" "${BACKUP_PATH}"
  run_test_fail_point "after_backup"
fi

if [[ -n "${SOURCE_DIR}" ]]; then
  if [[ "${SKIP_INSTALL_BUILD}" -eq 1 ]]; then
    log "Promoting local source override into current/ via symlink"
    new_source_symlink "${CURRENT_ROOT}" "${SOURCE_ROOT}"
  else
    log "Copying local source override into current/ for isolated install/build"
    copy_source_tree "${SOURCE_ROOT}" "${CURRENT_ROOT}"
  fi
else
  log "Promoting extracted source tree into current/"
  mv "${SOURCE_ROOT}" "${CURRENT_ROOT}"
fi
run_test_fail_point "after_promote"

run_test_fail_point "before_install_build"
if [[ "${SKIP_INSTALL_BUILD}" -eq 0 ]]; then
  PACKAGE_MANAGER="$(node -e "const fs=require('fs');const path=require('path');const pkg=JSON.parse(fs.readFileSync(path.join(process.argv[1],'package.json'),'utf8'));process.stdout.write(pkg.packageManager || 'pnpm@10');" "${CURRENT_ROOT}")" \
    || fail "Failed to resolve packageManager from package.json."

  log "Activating ${PACKAGE_MANAGER} via corepack"
  corepack prepare "${PACKAGE_MANAGER}" --activate >/dev/null || fail "corepack prepare ${PACKAGE_MANAGER} failed."

  (
    cd "${CURRENT_ROOT}"
    if [[ "${INSTALL_PAYLOAD_KIND}" == "release-light" ]]; then
      log "Installing production workspace dependencies from release-light package"
      corepack pnpm install --prod --frozen-lockfile || fail "corepack pnpm install failed."
    else
      log "Installing workspace dependencies"
      corepack pnpm install || fail "corepack pnpm install failed."

      log "Building workspace"
      corepack pnpm build || fail "corepack pnpm build failed."
    fi
  )
else
  log "Skipping dependency install/build (--skip-install-build)"
fi
if [[ -f "${CURRENT_ROOT}/start.sh" ]]; then
  chmod +x "${CURRENT_ROOT}/start.sh"
fi

write_unix_wrappers "${INSTALL_ROOT}"
write_install_metadata "${INSTALL_ROOT}" "${TAG_NAME}" "${RELEASE_NAME}" "${INSTALL_SOURCE_TYPE}"
INSTALL_STATE_DIR="$(resolve_state_dir)"

SETUP_STEP_MESSAGE="$(get_setup_step_message "${INSTALL_ROOT}" "${INSTALL_STATE_DIR}")"
SETUP_SUMMARY="$(get_setup_summary "${INSTALL_ROOT}" "${INSTALL_STATE_DIR}")"
FIRST_START_SUMMARY="$(get_first_start_summary "${INSTALL_ROOT}" "${INSTALL_STATE_DIR}")"

if should_run_setup "${INSTALL_ROOT}" "${INSTALL_STATE_DIR}"; then
  log "${SETUP_STEP_MESSAGE}"
  run_test_fail_point "before_setup"
  "${INSTALL_ROOT}/bdd" setup || fail "'bdd setup' failed."
else
  log "${SETUP_STEP_MESSAGE}"
fi

if [[ -n "${FIRST_START_SUMMARY}" ]]; then
  write_first_start_notice "${INSTALL_ROOT}" \
    "[NOTICE] Upgrade preserved your existing .env.local and skipped bdd setup." \
    "[NOTICE] This first start will reuse your current config." \
    "[NOTICE] If provider, channel, or auth settings need refresh, run: ${INSTALL_ROOT}/bdd setup" \
    "[NOTICE] Or rerun the installer with --force-setup."
else
  write_first_start_notice "${INSTALL_ROOT}"
fi

log "Install complete."
printf '  Install root: %s\n' "${INSTALL_ROOT}"
printf '  Start:        %s\n' "${INSTALL_ROOT}/start.sh"
printf '  CLI:          %s\n' "${INSTALL_ROOT}/bdd"
printf '  Setup:        %s\n' "${SETUP_SUMMARY}"
if [[ -n "${FIRST_START_SUMMARY}" ]]; then
  printf '  First start:  %s\n' "${FIRST_START_SUMMARY}"
fi
INSTALL_SUCCEEDED=1
