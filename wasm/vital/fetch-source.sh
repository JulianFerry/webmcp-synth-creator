#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPOSITORY_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
VENDOR_DIR="${REPOSITORY_ROOT}/vendor/vital"
UPSTREAM_URL="https://github.com/mtytel/vital.git"
UPSTREAM_COMMIT="636ca0ef517a4db087a6a08a6a8a5e704e21f836"

apply_patches() {
  local patch
  for patch in "${SCRIPT_DIR}"/patches/*.patch; do
    [[ -e "${patch}" ]] || continue
    if git -C "${VENDOR_DIR}" apply --reverse --check --ignore-space-change "${patch}" >/dev/null 2>&1; then
      printf 'Patch already applied: %s\n' "$(basename "${patch}")"
    elif git -C "${VENDOR_DIR}" apply --check --ignore-space-change "${patch}"; then
      git -C "${VENDOR_DIR}" apply --ignore-space-change "${patch}"
      printf 'Applied patch: %s\n' "$(basename "${patch}")"
    else
      printf 'Patch cannot be applied cleanly: %s\n' "${patch}" >&2
      exit 1
    fi
  done
}

if [[ -d "${VENDOR_DIR}/.git" ]]; then
  actual_commit="$(git -C "${VENDOR_DIR}" rev-parse HEAD)"
  if [[ "${actual_commit}" != "${UPSTREAM_COMMIT}" ]]; then
    printf 'Vital source is at %s; expected %s. Remove vendor/vital and fetch again.\n' \
      "${actual_commit}" "${UPSTREAM_COMMIT}" >&2
    exit 1
  fi
  apply_patches
  printf 'Vital source already present at %s.\n' "${UPSTREAM_COMMIT}"
  exit 0
fi

if [[ -e "${VENDOR_DIR}" ]]; then
  printf '%s exists but is not a Git checkout. Remove it and fetch again.\n' "${VENDOR_DIR}" >&2
  exit 1
fi

mkdir -p "$(dirname "${VENDOR_DIR}")"
git clone --filter=blob:none --no-checkout "${UPSTREAM_URL}" "${VENDOR_DIR}"
git -C "${VENDOR_DIR}" checkout --detach "${UPSTREAM_COMMIT}"
apply_patches

printf 'Fetched Vital at %s. Do not edit vendor/vital in place.\n' "${UPSTREAM_COMMIT}"
