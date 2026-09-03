#!/usr/bin/env bash

# Produces wasm/vital/build/{vital.mjs,vital.wasm} for automated builds.
#
# A production `npm run build` fails without those artifacts, but they are
# generated and therefore ignored by Git. Continuous integration and Vercel both
# run this script, which reuses a content-addressed cache and only bootstraps the
# Emscripten toolchain when the cache misses.

set -euo pipefail

REPOSITORY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WASM_DIR="${REPOSITORY_ROOT}/wasm/vital"
BUILD_DIR="${WASM_DIR}/build"
CACHE_DIR="${VITAL_CACHE_DIR:-${REPOSITORY_ROOT}/.vercel/cache/vital}"
EMSDK_VERSION="3.1.64"
EMSDK_DIR="${CACHE_DIR}/emsdk"

# Everything that can change the emitted artifact, so a cached build is only
# reused for an identical toolchain, upstream pin, patch set, and bridge.
build_key() {
  cat \
    "${WASM_DIR}/UPSTREAM.json" \
    "${WASM_DIR}/CMakeLists.txt" \
    "${WASM_DIR}/bridge.cpp" \
    "${WASM_DIR}/build.sh" \
    "${WASM_DIR}/fetch-source.sh" \
    "${WASM_DIR}"/patches/*.patch \
    <(printf 'emsdk=%s\n' "${EMSDK_VERSION}") |
    if command -v sha256sum >/dev/null 2>&1; then sha256sum; else shasum -a 256; fi |
    cut -c1-16
}

KEY="$(build_key)"
CACHED_DIR="${CACHE_DIR}/artifacts/${KEY}"

install_artifacts_from() {
  mkdir -p "${BUILD_DIR}"
  cp "${1}/vital.mjs" "${1}/vital.wasm" "${BUILD_DIR}/"
}

if [[ -f "${CACHED_DIR}/vital.mjs" && -f "${CACHED_DIR}/vital.wasm" ]]; then
  printf 'Reusing cached Vital WASM artifact %s\n' "${KEY}"
  install_artifacts_from "${CACHED_DIR}"
  exit 0
fi

# CMake and Ninja come from PyPI rather than a system package manager so the
# script needs no root and behaves the same on Vercel and GitHub runners.
ensure_host_tools() {
  local missing=()
  command -v cmake >/dev/null 2>&1 || missing+=(cmake)
  command -v ninja >/dev/null 2>&1 || missing+=(ninja)
  [[ ${#missing[@]} -eq 0 ]] && return 0

  printf 'Installing host build tools: %s\n' "${missing[*]}"
  # Some build images (Vercel) ship a uv-managed Python that refuses plain
  # --user installs under PEP 668, so fall back to an explicit override.
  python3 -m pip install --quiet --user "${missing[@]}" ||
    python3 -m pip install --quiet --user --break-system-packages "${missing[@]}"
  PATH="$(python3 -c 'import site; print(site.USER_BASE)')/bin:${PATH}"
  export PATH
}

ensure_emsdk() {
  if [[ ! -d "${EMSDK_DIR}/.git" ]]; then
    mkdir -p "$(dirname "${EMSDK_DIR}")"
    git clone --depth 1 https://github.com/emscripten-core/emsdk.git "${EMSDK_DIR}"
  fi

  "${EMSDK_DIR}/emsdk" install "${EMSDK_VERSION}"
  "${EMSDK_DIR}/emsdk" activate "${EMSDK_VERSION}"
  # shellcheck disable=SC1091
  source "${EMSDK_DIR}/emsdk_env.sh"
}

ensure_host_tools
ensure_emsdk

bash "${WASM_DIR}/fetch-source.sh"
bash "${WASM_DIR}/build.sh"

mkdir -p "${CACHED_DIR}"
cp "${BUILD_DIR}/vital.mjs" "${BUILD_DIR}/vital.wasm" "${CACHED_DIR}/"
printf 'Cached Vital WASM artifact %s\n' "${KEY}"
