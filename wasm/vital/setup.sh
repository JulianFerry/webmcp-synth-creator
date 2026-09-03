#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPOSITORY_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
EMSDK_VERSION="${EMSDK_VERSION:-3.1.64}"
EMSDK_DIR="${EMSDK_DIR:-${XDG_CACHE_HOME:-${HOME}/.cache}/webmcp-synth-creator/emsdk}"
DRY_RUN=false

usage() {
  cat <<'EOF'
Usage: bash wasm/vital/setup.sh [--dry-run]

Perform first-time setup for WebMCP Synth Creator:
  1. Install missing macOS build packages with Homebrew.
  2. Install and activate the pinned Emscripten SDK.
  3. Install npm dependencies.
  4. Fetch and patch the pinned Vital source.
  5. Build Vital WASM and the production application.

Environment overrides:
  EMSDK_DIR      Emscripten SDK checkout location.
  EMSDK_VERSION  Emscripten SDK version (default: 3.1.64).
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      DRY_RUN=true
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      printf 'Unknown option: %s\n' "$1" >&2
      usage >&2
      exit 2
      ;;
  esac
  shift
done

print_command() {
  printf '+'
  printf ' %q' "$@"
  printf '\n'
}

run() {
  print_command "$@"
  if [[ "${DRY_RUN}" == false ]]; then
    "$@"
  fi
}

require_tool() {
  local tool="$1"
  local guidance="$2"
  if ! command -v "${tool}" >/dev/null 2>&1; then
    printf 'Required tool is unavailable: %s. %s\n' "${tool}" "${guidance}" >&2
    exit 1
  fi
}

check_node_version() {
  if ! node -e '
    const [major, minor] = process.versions.node.split(".").map(Number)
    process.exit(major === 20 ? Number(minor < 19) : Number(major < 22 || (major === 22 && minor < 12)))
  '; then
    printf 'Node.js %s is unsupported. Install Node.js ^20.19.0 or >=22.12.0.\n' "$(node --version)" >&2
    exit 1
  fi
}

install_macos_build_tools() {
  local missing=()
  command -v cmake >/dev/null 2>&1 || missing+=(cmake)
  command -v ninja >/dev/null 2>&1 || missing+=(ninja)
  command -v python3 >/dev/null 2>&1 || missing+=(python)

  if [[ ${#missing[@]} -eq 0 ]]; then
    return
  fi
  if ! command -v brew >/dev/null 2>&1; then
    printf 'Missing build tools: %s. Install Homebrew from https://brew.sh, then rerun setup.\n' "${missing[*]}" >&2
    exit 1
  fi
  run brew install "${missing[@]}"
}

printf 'Setting up WebMCP Synth Creator from %s\n' "${REPOSITORY_ROOT}"

if [[ "${DRY_RUN}" == false ]]; then
  require_tool git 'Install the Xcode Command Line Tools with: xcode-select --install'
  require_tool node 'Install a supported Node.js release (^20.19 or >=22.12).'
  require_tool npm 'Install a supported Node.js release (^20.19 or >=22.12).'
  require_tool gzip 'Install gzip and rerun setup.'
  check_node_version

  if [[ "$(uname -s)" == Darwin ]]; then
    install_macos_build_tools
  else
    require_tool cmake 'Install CMake 3.22 or newer.'
    require_tool ninja 'Install Ninja.'
    require_tool python3 'Install Python 3.'
  fi
fi

if [[ ! -d "${EMSDK_DIR}/.git" ]]; then
  if [[ -e "${EMSDK_DIR}" ]]; then
    printf '%s exists but is not an emsdk Git checkout. Set EMSDK_DIR or remove that path.\n' "${EMSDK_DIR}" >&2
    exit 1
  fi
  run mkdir -p "$(dirname "${EMSDK_DIR}")"
  run git clone https://github.com/emscripten-core/emsdk.git "${EMSDK_DIR}"
fi

run "${EMSDK_DIR}/emsdk" install "${EMSDK_VERSION}"
run "${EMSDK_DIR}/emsdk" activate "${EMSDK_VERSION}"

if [[ "${DRY_RUN}" == true ]]; then
  print_command source "${EMSDK_DIR}/emsdk_env.sh"
else
  # shellcheck source=/dev/null
  source "${EMSDK_DIR}/emsdk_env.sh"
fi

run npm --prefix "${REPOSITORY_ROOT}" ci
run bash "${SCRIPT_DIR}/fetch-source.sh"
run bash "${SCRIPT_DIR}/build.sh"
run npm --prefix "${REPOSITORY_ROOT}" run build

printf '\nSetup complete. Start the workbench with:\n  npm run dev -- --strictPort\n'
