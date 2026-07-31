#!/usr/bin/env bash
# One-command composer mobile visual regression run.
#
#   bash scripts/test-composer-mobile.sh              # verify against baselines
#   bash scripts/test-composer-mobile.sh --update     # re-baseline snapshots
#   bash scripts/test-composer-mobile.sh --all        # composer + live workspace
#
# Runs fully offline: tests/ui/fixtures/mock-backend.ts mocks auth, database and
# API routes, so no self-hosted backend or credentials are required.
set -euo pipefail
cd "$(dirname "$0")/.."

SPECS=("tests/ui/composer.spec.ts")
ARGS=("--project=mobile")

for arg in "$@"; do
  case "$arg" in
    --update|--update-snapshots|-u) ARGS+=("--update-snapshots") ;;
    --all) SPECS+=("tests/ui/live-workspace.spec.ts") ;;
    --desktop) ARGS=("${ARGS[@]/--project=mobile/--project=desktop}") ;;
    *) ARGS+=("$arg") ;;
  esac
done

echo "▶ playwright test ${SPECS[*]} ${ARGS[*]}"
bunx playwright test "${SPECS[@]}" "${ARGS[@]}"
