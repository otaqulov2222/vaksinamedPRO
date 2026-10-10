#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# VaksinaMed Staging Deployment Script (Invoked by unprivileged 'deployer' user)
# Target: Hetzner Staging (178.104.183.137)
#
# Privilege Boundary:
#   1. Pre-flight check: Verifies root control wrapper exists BEFORE making
#      ANY changes on the server. If missing, aborts immediately.
#   2. deployer writes ONLY to dedicated release directories:
#      - /var/www/vaksinamed-app-releases/${RELEASE_ID} (frontend)
#      - /var/vaksinamed-releases/${RELEASE_ID} (backend)
#   3. deployer NEVER writes to /opt/vaksinamed, /etc, /usr/local/bin.
#   4. Delegates to root-owned /usr/local/bin/vaksinamed-staging-ctl for
#      privileged verification, atomic symlink swap, and container update.
# ==============================================================================

RELEASE_ID="${1:-$(date +%Y%m%d%H%M%S)}"
FRONTEND_RELEASES_DIR="/var/www/vaksinamed-app-releases"
BACKEND_RELEASES_DIR="/var/vaksinamed-releases"
WRAPPER_BIN="/usr/local/bin/vaksinamed-staging-ctl"

# 1. Validate Release ID format strictly
if [[ ! "${RELEASE_ID}" =~ ^[a-zA-Z0-9._-]{7,64}$ ]]; then
    echo "ERROR: Invalid release ID format: ${RELEASE_ID}" >&2
    exit 1
fi

# 2. Strict Pre-flight Guard: Verify Root Control Wrapper exists BEFORE touching any server files
if [ ! -x "${WRAPPER_BIN}" ]; then
    echo "CRITICAL ERROR: Root control wrapper ${WRAPPER_BIN} is not installed or not executable!" >&2
    echo "Server provisioning required by root before deployment can proceed." >&2
    echo "No server files or release directories were modified." >&2
    exit 1
fi

echo "=== [VAKSINAMED] Preparing Unprivileged Deployment (Release: ${RELEASE_ID}) ==="

# 3. Unpack Frontend Distribution into dedicated releases area
mkdir -p "${FRONTEND_RELEASES_DIR}/${RELEASE_ID}"
if [ -f "/tmp/frontend-dist.tar.gz" ]; then
    echo "--> Unpacking frontend distribution to ${FRONTEND_RELEASES_DIR}/${RELEASE_ID}..."
    tar -xzf /tmp/frontend-dist.tar.gz -C "${FRONTEND_RELEASES_DIR}/${RELEASE_ID}"
    rm -f /tmp/frontend-dist.tar.gz
elif [ -f "/home/deployer/uploads/frontend-dist.tar.gz" ]; then
    echo "--> Unpacking frontend distribution from uploads..."
    tar -xzf /home/deployer/uploads/frontend-dist.tar.gz -C "${FRONTEND_RELEASES_DIR}/${RELEASE_ID}"
    rm -f /home/deployer/uploads/frontend-dist.tar.gz
fi

# 4. Unpack Backend Distribution into dedicated releases area (NEVER /opt/vaksinamed)
mkdir -p "${BACKEND_RELEASES_DIR}/${RELEASE_ID}"
if [ -f "/tmp/backend-dist.tar.gz" ]; then
    echo "--> Unpacking backend distribution to ${BACKEND_RELEASES_DIR}/${RELEASE_ID}..."
    tar -xzf /tmp/backend-dist.tar.gz -C "${BACKEND_RELEASES_DIR}/${RELEASE_ID}"
    rm -f /tmp/backend-dist.tar.gz
elif [ -f "/home/deployer/uploads/backend-dist.tar.gz" ]; then
    echo "--> Unpacking backend distribution from uploads..."
    tar -xzf /home/deployer/uploads/backend-dist.tar.gz -C "${BACKEND_RELEASES_DIR}/${RELEASE_ID}"
    rm -f /home/deployer/uploads/backend-dist.tar.gz
fi

# Copy release.sha256 if provided
if [ -f "/tmp/release.sha256" ]; then
    cp /tmp/release.sha256 "${BACKEND_RELEASES_DIR}/${RELEASE_ID}/release.sha256"
    rm -f /tmp/release.sha256
fi

# 5. Delegate to Privileged Staging Control Wrapper (allowed by sudoers)
echo "--> Executing privileged staging control wrapper..."
sudo "${WRAPPER_BIN}" deploy "${RELEASE_ID}"

echo "=== [VAKSINAMED] Deployment Complete (Release: ${RELEASE_ID}) ==="
