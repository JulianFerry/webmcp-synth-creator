#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPOSITORY_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
VITAL_SOURCE_DIR="${REPOSITORY_ROOT}/vendor/vital"
BUILD_DIR="${SCRIPT_DIR}/build"

for tool in emcmake emmake cmake ninja gzip; do
  if ! command -v "${tool}" >/dev/null 2>&1; then
    printf 'Required build tool is unavailable: %s\n' "${tool}" >&2
    exit 1
  fi
done

if [[ ! -d "${VITAL_SOURCE_DIR}/.git" ]]; then
  printf 'Vital source is missing. Run bash wasm/vital/fetch-source.sh first.\n' >&2
  exit 1
fi

rm -rf "${BUILD_DIR}"

emcmake cmake \
  -S "${SCRIPT_DIR}" \
  -B "${BUILD_DIR}" \
  -G Ninja \
  -DCMAKE_BUILD_TYPE=Release \
  -DVITAL_SOURCE_DIR="${VITAL_SOURCE_DIR}"

emmake cmake --build "${BUILD_DIR}" --target vital

for artifact in "${BUILD_DIR}/vital.mjs" "${BUILD_DIR}/vital.wasm"; do
  if [[ ! -f "${artifact}" ]]; then
    printf 'Expected build artifact is missing: %s\n' "${artifact}" >&2
    exit 1
  fi

  raw_bytes="$(wc -c < "${artifact}" | tr -d ' ')"
  gzip_bytes="$(gzip -9 -c "${artifact}" | wc -c | tr -d ' ')"
  printf '%s: raw=%s bytes, gzip=%s bytes\n' "$(basename "${artifact}")" "${raw_bytes}" "${gzip_bytes}"
done
