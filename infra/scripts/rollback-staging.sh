#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# VaksinaMed Staging Rollback Script (Invoked by 'deployer' user)
# Delegates to root-owned /usr/local/bin/vaksinamed-staging-ctl
# ==============================================================================

WRAPPER_BIN="/usr/local/bin/vaksinamed-staging-ctl"
BACKEND_DIR="/opt/vaksinamed"

echo "=== [VAKSINAMED] Initiating Staging Rollback ==="

if [ -x "${WRAPPER_BIN}" ]; then
    sudo "${WRAPPER_BIN}" rollback
else
    echo "ERROR: Privileged wrapper ${WRAPPER_BIN} not found! It must be installed by root into /usr/local/bin/vaksinamed-staging-ctl." >&2
    exit 1
fi

echo "=== [VAKSINAMED] Rollback Completed ==="
