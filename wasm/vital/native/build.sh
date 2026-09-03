#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPOSITORY_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
VITAL_SOURCE_DIR="${REPOSITORY_ROOT}/vendor/vital"
BUILD_DIR="${SCRIPT_DIR}/build"

for tool in cmake ninja; do
  if ! command -v "${tool}" >/dev/null 2>&1; then
    printf 'Required native build tool is unavailable: %s\n' "${tool}" >&2
    exit 1
  fi
done

if [[ ! -d "${VITAL_SOURCE_DIR}/.git" ]]; then
  printf 'Vital source is missing. Run bash wasm/vital/fetch-source.sh first.\n' >&2
  exit 1
fi

rm -rf "${BUILD_DIR}"

cmake_args=(
  -S "${SCRIPT_DIR}"
  -B "${BUILD_DIR}"
  -G Ninja
  -DCMAKE_BUILD_TYPE=Release
  -DVITAL_SOURCE_DIR="${VITAL_SOURCE_DIR}"
)

if [[ "$(uname -s)" == "Darwin" && "$(uname -m)" == "arm64" ]]; then
  if ! arch -x86_64 /usr/bin/true >/dev/null 2>&1; then
    printf 'The pinned Vital source requires an x86_64 reference build; install Rosetta 2.\n' >&2
    exit 1
  fi
  cmake_args+=( -DCMAKE_OSX_ARCHITECTURES=x86_64 )
fi

cmake "${cmake_args[@]}"
cmake --build "${BUILD_DIR}" --target vital-native-render

artifact="${BUILD_DIR}/vital-native-render"
if [[ ! -x "${artifact}" ]]; then
  printf 'Expected native reference artifact is missing: %s\n' "${artifact}" >&2
  exit 1
fi

printf 'vital-native-render: %s bytes\n' "$(wc -c < "${artifact}" | tr -d ' ')"
