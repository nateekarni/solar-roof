#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
if [[ $# == 1 && "$1" == --identity ]]; then exec pnpm exec tsx scripts/ci/platform-release-check.ts --identity; fi
if [[ $# -lt 2 || "$1" != --evidence || ! -f "$2" ]]; then
  echo 'Usage: platform-release-check.sh --evidence <file> [--gate monitoring|recovery|retention|financial|all]' >&2
  exit 1
fi
pnpm exec tsx scripts/ci/platform-release-check.ts "$@"
