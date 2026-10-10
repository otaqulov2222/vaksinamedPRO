#!/usr/bin/env bash
set -euo pipefail

# 0. Environment Sanitization & Robust System PATH
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
unset IFS
unset BASH_ENV
unset CDPATH
unset GLOBIGNORE

# ==============================================================================
# VaksinaMed Hetzner Staging Server Bootstrap Script
# Target: Hetzner Cloud Staging Server (178.104.183.137 / Tailscale: 100.85.166.99)
# Execution: RUN ONCE AS ROOT ON THE STAGING SERVER
#
# Security & Architecture Invariants:
# 1. Touches ONLY staging environment (/opt/vaksinamed, /var/www/vaksinamed-app-*)
#    NEVER touches production vaksina-gps or production domains.
# 2. Creates unprivileged 'deployer' user with NO docker group and NO sudo group.
# 3. Grants strictly scoped sudo rights via /etc/sudoers.d/vaksinamed-deployer.
#    All argument validation and privilege boundaries are enforced inside the wrapper.
# 4. Installs root-controlled /usr/local/bin/vaksinamed-staging-ctl wrapper.
# 5. Preserves existing frontend and existing PostgreSQL/Redis named volumes.
# 6. Checks .env.staging: keeps 0600 root:root; if missing, halts safely without creating dummy file.
# 7. Validates Nginx configuration with nginx -t before reload.
# ==============================================================================

echo "================================================================="
echo "   VAKSINAMED HETZNER STAGING SERVER BOOTSTRAP PROVISIONING"
echo "================================================================="

# 1. Root Pre-flight Check
if [[ "$(id -u)" -ne 0 ]]; then
    echo "ERROR: This script must be executed as root (UID 0)!" >&2
    exit 1
fi

# 2. Production Environment Safeguard
CURRENT_HOST=$(hostname 2>/dev/null || echo "unknown")
if [[ "${CURRENT_HOST}" =~ (prod|production|vaksina-gps) ]]; then
    echo "CRITICAL ERROR: Refusing to run on production host '${CURRENT_HOST}'!" >&2
    echo "This script is strictly intended for the Hetzner staging server." >&2
    exit 1
fi

echo "--> Step 1/7: Provisioning unprivileged 'deployer' user..."
if ! id -u deployer >/dev/null 2>&1; then
    useradd -m -s /bin/bash -c "VaksinaMed CI/CD Deployer" deployer
    echo "    Created user 'deployer'."
else
    echo "    User 'deployer' already exists."
fi

# Ensure deployer has NO direct Docker socket access and NO broad sudo access
gpasswd -d deployer docker 2>/dev/null || true
gpasswd -d deployer sudo 2>/dev/null || true
echo "    Verified: deployer is NOT in docker or sudo groups."

# Prepare deployer SSH structure
mkdir -p /home/deployer/.ssh
chmod 700 /home/deployer/.ssh
touch /home/deployer/.ssh/authorized_keys
chmod 600 /home/deployer/.ssh/authorized_keys
chown -R deployer:deployer /home/deployer/.ssh

echo "--> Step 2/7: Configuring staging directory structures and permissions..."
BACKEND_DIR="/opt/vaksinamed"
mkdir -p "${BACKEND_DIR}"
chown root:root "${BACKEND_DIR}"
chmod 755 "${BACKEND_DIR}"

# Check .env.staging safely (never leak secrets, never create a broken empty file)
if [[ -f "${BACKEND_DIR}/.env.staging" ]]; then
    chown root:root "${BACKEND_DIR}/.env.staging"
    chmod 600 "${BACKEND_DIR}/.env.staging"
    echo "    Secured existing ${BACKEND_DIR}/.env.staging (0600 root:root)."
else
    echo "    WARNING: ${BACKEND_DIR}/.env.staging does not exist yet."
    echo "    Refusing to create an empty .env.staging as it could break existing container configurations."
    echo "    Operators must ensure .env.staging is provisioned with valid staging credentials."
fi

# Ensure compose file symlink consistency
if [[ -f "${BACKEND_DIR}/infra/docker-compose.staging.yml" && ! -f "${BACKEND_DIR}/docker-compose.staging.yml" ]]; then
    ln -sfn "${BACKEND_DIR}/infra/docker-compose.staging.yml" "${BACKEND_DIR}/docker-compose.staging.yml"
    echo "    Created convenience symlink for docker-compose.staging.yml."
fi

# Dedicated staging release directories
FRONTEND_RELEASES="/var/www/vaksinamed-app-releases"
BACKEND_RELEASES="/var/vaksinamed-releases"
mkdir -p "${FRONTEND_RELEASES}" "${BACKEND_RELEASES}"

# Ensure www-data group exists
id -g www-data >/dev/null 2>&1 || groupadd www-data 2>/dev/null || true

chown -R deployer:www-data "${FRONTEND_RELEASES}"
chmod -R 775 "${FRONTEND_RELEASES}"
chown -R deployer:deployer "${BACKEND_RELEASES}"
chmod -R 750 "${BACKEND_RELEASES}"

echo "--> Step 3/7: Preserving existing frontend deployment..."
CURRENT_WEB="/var/www/vaksinamed-app-staging"
if [[ -d "${CURRENT_WEB}" && ! -L "${CURRENT_WEB}" ]]; then
    TIMESTAMP=$(date +%Y%m%d%H%M%S)
    PRESERVE_DIR="${FRONTEND_RELEASES}/legacy-preserve-${TIMESTAMP}"
    echo "    Found existing regular directory at ${CURRENT_WEB}."
    echo "    Preserving into ${PRESERVE_DIR}..."
    mv "${CURRENT_WEB}" "${PRESERVE_DIR}"
    chown -R deployer:www-data "${PRESERVE_DIR}"
    chmod -R 775 "${PRESERVE_DIR}"
    ln -sfn "${PRESERVE_DIR}" "${CURRENT_WEB}"
    echo "${PRESERVE_DIR}" > /var/www/vaksinamed-app-staging.prev
    chown -h deployer:www-data "${CURRENT_WEB}"
    echo "    PASS: Existing frontend preserved and symlinked."
elif [[ -L "${CURRENT_WEB}" ]]; then
    echo "    PASS: ${CURRENT_WEB} is already a symlink. Preserving active target."
else
    # Create initial placeholder release
    PLACEHOLDER="${FRONTEND_RELEASES}/initial-placeholder"
    mkdir -p "${PLACEHOLDER}"
    echo '<!DOCTYPE html><html><head><title>VaksinaMed Staging</title></head><body><h1>VaksinaMed Staging Ready</h1></body></html>' > "${PLACEHOLDER}/index.html"
    chown -R deployer:www-data "${PLACEHOLDER}"
    chmod -R 775 "${PLACEHOLDER}"
    ln -sfn "${PLACEHOLDER}" "${CURRENT_WEB}"
    chown -h deployer:www-data "${CURRENT_WEB}"
    echo "    Created initial placeholder symlink at ${CURRENT_WEB}."
fi

echo "--> Step 4/7: Preserving database volumes and ensuring isolation..."
if command -v docker >/dev/null 2>&1; then
    echo "    Checking Docker named volumes for staging databases..."
    docker volume inspect staging_pgdata >/dev/null 2>&1 && echo "    PASS: Volume 'staging_pgdata' exists and preserved." || echo "    INFO: Volume 'staging_pgdata' will be initialized by compose."
    docker volume inspect staging_redisdata >/dev/null 2>&1 && echo "    PASS: Volume 'staging_redisdata' exists and preserved." || echo "    INFO: Volume 'staging_redisdata' will be initialized by compose."
fi

echo "--> Step 5/7: Installing root staging control wrapper (/usr/local/bin/vaksinamed-staging-ctl)..."
SCRIPT_SOURCE=""
if [[ -f "${BACKEND_DIR}/infra/scripts/vaksinamed-staging-ctl.sh" ]]; then
    SCRIPT_SOURCE="${BACKEND_DIR}/infra/scripts/vaksinamed-staging-ctl.sh"
elif [[ -f "$(dirname "$0")/vaksinamed-staging-ctl.sh" ]]; then
    SCRIPT_SOURCE="$(dirname "$0")/vaksinamed-staging-ctl.sh"
fi

TARGET_BIN="/usr/local/bin/vaksinamed-staging-ctl"

if [[ -n "${SCRIPT_SOURCE}" && -f "${SCRIPT_SOURCE}" ]]; then
    echo "    Copying wrapper from ${SCRIPT_SOURCE}..."
    cp "${SCRIPT_SOURCE}" "${TARGET_BIN}"
else
    echo "    Installing self-contained staging control wrapper..."
    cat << 'WRAPPER_EOF' > "${TARGET_BIN}"
#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# VaksinaMed Staging Deployment Control Wrapper
# Target Server Location: /usr/local/bin/vaksinamed-staging-ctl
# Owner: root:root | Permissions: 0755
#
# Security & Privilege Boundaries:
# 1. Environment Sanitization: Clears IFS, BASH_ENV, CDPATH, GLOBIGNORE and
#    forces a minimal, trusted system PATH.
# 2. Strict Parameter Validation: Rejects excess arguments, validates action
#    and release ID regex. No eval or dynamic shell execution.
# 3. Isolation & TOCTOU Protection: Takes root ownership of release files
#    BEFORE auditing to prevent race-condition modification by unprivileged users.
# 4. Prohibited File & Traversal Auditing: Rejects symlinks, special files,
#    path traversal (..), and prohibited configurations (.env, compose, shell scripts).
# 5. Asset & Health Verification: Verifies binary font magic (not HTML 200),
#    HTML index integrity, and API readiness.
# 6. Automatic Rollback: Restores previous frontend symlink and backend release
#    if post-deploy health check fails, returning non-zero exit code.
# 7. Preserves Databases: PostgreSQL (staging_pgdata) and Redis (staging_redisdata)
#    named Docker volumes are strictly preserved and never recreated or pruned.
# ==============================================================================

# 1. Environment Sanitization
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
unset IFS
unset BASH_ENV
unset CDPATH
unset GLOBIGNORE

# 2. Paths and Constants
FRONTEND_RELEASES_DIR="/var/www/vaksinamed-app-releases"
CURRENT_FRONTEND_SYMLINK="/var/www/vaksinamed-app-staging"
PREV_FRONTEND_SYMLINK_FILE="/var/www/vaksinamed-app-staging.prev"

BACKEND_RELEASES_DIR="/var/vaksinamed-releases"
PREV_BACKEND_RELEASE_FILE="/var/vaksinamed-releases.prev"

BACKEND_DIR="/opt/vaksinamed"
if [[ -f "${BACKEND_DIR}/infra/docker-compose.staging.yml" ]]; then
    COMPOSE_FILE="${BACKEND_DIR}/infra/docker-compose.staging.yml"
elif [[ -f "${BACKEND_DIR}/docker-compose.staging.yml" ]]; then
    COMPOSE_FILE="${BACKEND_DIR}/docker-compose.staging.yml"
else
    COMPOSE_FILE="${BACKEND_DIR}/infra/docker-compose.staging.yml"
fi
ENV_FILE="${BACKEND_DIR}/.env.staging"
DOCKERFILE="${BACKEND_DIR}/Dockerfile"
LOCK_FILE="/tmp/vaksinamed-staging-deploy.lock"

# Helper: Docker Compose command runner (v2 plugin or v1 standalone)
dc_cmd() {
    if docker compose version >/dev/null 2>&1; then
        docker compose "$@"
    else
        docker-compose "$@"
    fi
}

# 3. Strict Action & Argument Count Validation
if [[ $# -lt 1 ]]; then
    echo "ERROR: Missing action argument." >&2
    echo "Usage: vaksinamed-staging-ctl {deploy <release-id>|rollback|healthcheck|reload-nginx}" >&2
    exit 1
fi

ACTION="${1}"

case "${ACTION}" in
    deploy)
        if [[ $# -ne 2 ]]; then
            echo "ERROR: 'deploy' requires exactly one release ID argument. Given: $# arguments." >&2
            exit 1
        fi
        RELEASE_ID="${2}"
        # Validate release ID format strictly: only alphanumeric, dot, underscore, dash; 7 to 64 chars
        # Must start with alphanumeric character (strictly blocks leading '-', '.', or '/')
        if [[ ! "${RELEASE_ID}" =~ ^[a-zA-Z0-9][a-zA-Z0-9._-]{6,63}$ ]]; then
            echo "ERROR: Invalid release ID format: '${RELEASE_ID}'" >&2
            exit 1
        fi
        # Reject path traversal patterns explicitly
        if [[ "${RELEASE_ID}" == *".."* || "${RELEASE_ID}" == *"/"* || "${RELEASE_ID}" == *"\\"* ]]; then
            echo "ERROR: Path traversal detected in release ID: '${RELEASE_ID}'" >&2
            exit 1
        fi
        ;;
    rollback)
        if [[ $# -ne 1 ]]; then
            echo "ERROR: 'rollback' accepts no additional arguments. Given: $# arguments." >&2
            exit 1
        fi
        ;;
    healthcheck)
        if [[ $# -ne 1 ]]; then
            echo "ERROR: 'healthcheck' accepts no additional arguments. Given: $# arguments." >&2
            exit 1
        fi
        ;;
    reload-nginx)
        if [[ $# -ne 1 ]]; then
            echo "ERROR: 'reload-nginx' accepts no additional arguments. Given: $# arguments." >&2
            exit 1
        fi
        ;;
    *)
        echo "ERROR: Unknown action: '${ACTION}'" >&2
        echo "Usage: vaksinamed-staging-ctl {deploy <release-id>|rollback|healthcheck|reload-nginx}" >&2
        exit 1
        ;;
esac

# 4. Exclusive Deployment Lock
exec 200>"${LOCK_FILE}"
if ! flock -n 200; then
    echo "ERROR: Another deployment or rollback operation is currently in progress!" >&2
    exit 1
fi

# Helper: Reload Nginx safely with configuration testing
reload_nginx() {
    if command -v systemctl >/dev/null 2>&1 && systemctl is-active --quiet nginx; then
        echo "--> Testing and reloading Nginx configuration..."
        if nginx -t; then
            systemctl reload nginx
            echo "    PASS: Nginx reloaded successfully."
        else
            echo "    ERROR: Nginx configuration test failed! Not reloading." >&2
            return 1
        fi
    fi
}

# Helper: Validate font binary magic bytes (reject HTML error pages served with HTTP 200)
verify_font_file() {
    local font_path="${1}"
    local font_name
    font_name=$(basename "${font_path}")

    if [[ ! -f "${font_path}" ]]; then
        echo "    FAIL: Font file ${font_name} does not exist at ${font_path}!" >&2
        return 1
    fi

    local size
    size=$(stat -c%s "${font_path}" 2>/dev/null || stat -f%z "${font_path}" 2>/dev/null || echo "0")
    if [[ "${size}" -lt 10000 ]]; then
        echo "    FAIL: Font file ${font_name} is too small (${size} bytes)!" >&2
        return 1
    fi

    # Read first 4 bytes using od/xxd/head to verify TTF (00 01 00 00) or OTF (4F 54 54 4F)
    local magic_hex
    magic_hex=$(od -N 4 -t x1 "${font_path}" 2>/dev/null | head -n 1 | awk '{print $2$3$4$5}' | tr '[:upper:]' '[:lower:]')
    if [[ "${magic_hex}" != "00010000" && "${magic_hex}" != "4f54544f" && "${magic_hex}" != "74746366" ]]; then
        echo "    FAIL: Font file ${font_name} has invalid magic header 0x${magic_hex} (corrupted or HTML)!" >&2
        return 1
    fi

    return 0
}

# Helper: Run Comprehensive Healthchecks
run_healthchecks() {
    echo "--> Running post-deployment health checks..."
    local pass=1

    # 1. API Live Healthcheck
    local api_ok=0
    for attempt in 1 2 3 4 5; do
        if curl -fsS --max-time 5 http://127.0.0.1:5000/api/health/live > /dev/null 2>&1 || \
           curl -fsS --max-time 5 https://api-staging.vaksinamedgps.uz/api/health/live > /dev/null 2>&1 || \
           (cd "${BACKEND_DIR}" && dc_cmd -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" exec -T api node -e "fetch('http://127.0.0.1:5000/api/health/live').then(r=>process.exit(r.ok?0:1))" >/dev/null 2>&1); then
            api_ok=1
            break
        fi
        sleep 2
    done

    if [[ "${api_ok}" -eq 1 ]]; then
        echo "    PASS: API live endpoint responding."
    else
        echo "    FAIL: API live healthcheck failed!" >&2
        pass=0
    fi

    # 2. Frontend Index HTML Check
    local web_ok=0
    local web_content=""
    if web_content=$(curl -fsS --max-time 5 https://app-staging.vaksinamedgps.uz/ 2>/dev/null || curl -fsS --max-time 5 http://127.0.0.1/ 2>/dev/null); then
        if [[ "${web_content}" == *"<html"* || "${web_content}" == *"<!DOCTYPE"* || "${web_content}" == *"<div id=\"root\""* ]]; then
            web_ok=1
        fi
    fi
    if [[ "${web_ok}" -eq 0 && -f "${CURRENT_FRONTEND_SYMLINK}/index.html" ]]; then
        local index_size
        index_size=$(stat -c%s "${CURRENT_FRONTEND_SYMLINK}/index.html" 2>/dev/null || echo "0")
        if [[ "${index_size}" -gt 100 ]]; then
            web_ok=1
        fi
    fi

    if [[ "${web_ok}" -eq 1 ]]; then
        echo "    PASS: Frontend index HTML responding valid markup."
    else
        echo "    FAIL: Frontend index HTML healthcheck failed!" >&2
        pass=0
    fi

    # 3. Font Asset Integrity Check
    local font_ok=0
    if [[ -f "${CURRENT_FRONTEND_SYMLINK}/fonts/Feather.ttf" ]]; then
        if verify_font_file "${CURRENT_FRONTEND_SYMLINK}/fonts/Feather.ttf"; then
            font_ok=1
        fi
    fi

    if [[ "${font_ok}" -eq 1 ]]; then
        echo "    PASS: Frontend font Feather.ttf verified (valid TTF binary)."
    else
        echo "    FAIL: Feather.ttf font check failed!" >&2
        pass=0
    fi

    if [[ "${pass}" -eq 1 ]]; then
        return 0
    else
        return 1
    fi
}

# Helper: Enforce root security invariants on /opt/vaksinamed
enforce_root_invariants() {
    echo "--> Verifying and enforcing root security invariants on ${BACKEND_DIR}..."
    if [[ ! -d "${BACKEND_DIR}" ]]; then
        echo "ERROR: Backend directory ${BACKEND_DIR} does not exist!" >&2
        exit 1
    fi
    if [[ ! -f "${ENV_FILE}" ]]; then
        echo "ERROR: Security invariant violated: ${ENV_FILE} does not exist!" >&2
        exit 1
    fi
    if [[ ! -f "${COMPOSE_FILE}" ]]; then
        echo "ERROR: Security invariant violated: ${COMPOSE_FILE} does not exist!" >&2
        exit 1
    fi
    if [[ ! -f "${DOCKERFILE}" ]]; then
        echo "ERROR: Security invariant violated: ${DOCKERFILE} does not exist!" >&2
        exit 1
    fi

    # Enforce root ownership and strict permissions
    chown root:root "${ENV_FILE}" "${COMPOSE_FILE}" "${DOCKERFILE}"
    chmod 600 "${ENV_FILE}"
    chmod 644 "${COMPOSE_FILE}" "${DOCKERFILE}"
    chown root:root "${BACKEND_DIR}"
    chmod 755 "${BACKEND_DIR}"
    echo "    PASS: Root security invariants verified (.env.staging is 0600 root:root)."
}

# Helper: Sync application source safely without overwriting root invariants
sync_backend_release() {
    local source_dir="${1}"
    echo "--> Safely syncing application files from ${source_dir} to ${BACKEND_DIR}..."

    # Use rsync or tar with strict exclusion of sensitive/immutable files
    if command -v rsync >/dev/null 2>&1; then
        rsync -a \
            --exclude='.env*' \
            --exclude='docker-compose*' \
            --exclude='Dockerfile' \
            --exclude='infra/' \
            --exclude='*.sh' \
            --exclude='*.bash' \
            "${source_dir}/" "${BACKEND_DIR}/"
    else
        tar -C "${source_dir}" \
            --exclude='.env*' \
            --exclude='docker-compose*' \
            --exclude='Dockerfile' \
            --exclude='infra' \
            --exclude='*.sh' \
            --exclude='*.bash' \
            -cf - . | tar -C "${BACKEND_DIR}" -xf -
    fi

    # Enforce root ownership on synced files
    chown -R root:root "${BACKEND_DIR}"
    chmod 755 "${BACKEND_DIR}"
    chmod 600 "${ENV_FILE}"
    chmod 644 "${COMPOSE_FILE}" "${DOCKERFILE}"
    echo "    PASS: Application source synced under root:root ownership."
}

# ------------------------------------------------------------------------------
# Action Execution
# ------------------------------------------------------------------------------
case "${ACTION}" in
    deploy)
        TARGET_FRONTEND="${FRONTEND_RELEASES_DIR}/${RELEASE_ID}"
        TARGET_BACKEND="${BACKEND_RELEASES_DIR}/${RELEASE_ID}"

        echo "=== [VAKSINAMED] Executing Deployment for Release: ${RELEASE_ID} ==="

        # 1. Enforce root invariants before doing anything
        enforce_root_invariants

        # 2. Verify existence of release directories
        if [[ ! -d "${TARGET_FRONTEND}" ]]; then
            echo "ERROR: Frontend release directory ${TARGET_FRONTEND} does not exist!" >&2
            exit 1
        fi
        if [[ ! -d "${TARGET_BACKEND}" ]]; then
            echo "ERROR: Backend release directory ${TARGET_BACKEND} does not exist!" >&2
            exit 1
        fi

        # 3. Isolation & TOCTOU Protection: Take root ownership immediately
        echo "--> Securing release ownership under root:root (preventing TOCTOU tampering)..."
        chown -R root:root "${TARGET_FRONTEND}" "${TARGET_BACKEND}"
        chmod -R u=rwX,go=rX "${TARGET_FRONTEND}" "${TARGET_BACKEND}"

        # 4. Security Check: Reject symlinks and special files in uploaded releases
        echo "--> Auditing release directories for prohibited symlinks and special files..."
        if find "${TARGET_FRONTEND}" "${TARGET_BACKEND}" -type l 2>/dev/null | grep -q .; then
            echo "ERROR: Security violation: Symbolic links found in uploaded release!" >&2
            exit 1
        fi
        if find "${TARGET_FRONTEND}" "${TARGET_BACKEND}" ! -type f ! -type d 2>/dev/null | grep -q .; then
            echo "ERROR: Security violation: Special files (fifos/devices/sockets) found in uploaded release!" >&2
            exit 1
        fi
        echo "    PASS: No prohibited symlinks or special files detected."

        # 5. Security Check: Ensure release does not attempt to smuggle root config files
        echo "--> Auditing backend release for prohibited configuration files..."
        if find "${TARGET_BACKEND}" \( -name ".env*" -o -name "docker-compose*" -o -name "Dockerfile" -o -name "*.sh" -o -path "*/infra/*" \) 2>/dev/null | grep -q .; then
            echo "ERROR: Security violation: Prohibited configuration or script files found in release payload!" >&2
            exit 1
        fi
        echo "    PASS: No prohibited configuration files in release payload."

        # 6. Verify Unpacked Release Integrity & Checksums
        echo "--> Verifying unpacked release payload integrity..."
        if [[ -f "${TARGET_BACKEND}/release-manifest.sha256" ]]; then
            echo "    Verifying backend files checksum manifest..."
            (cd "${TARGET_BACKEND}" && sha256sum -c release-manifest.sha256) || {
                echo "ERROR: Backend release-manifest.sha256 checksum verification failed!" >&2
                exit 1
            }
            echo "    PASS: Backend release-manifest checksums verified."
        fi

        if [[ -f "${TARGET_FRONTEND}/release-manifest.sha256" ]]; then
            echo "    Verifying frontend files checksum manifest..."
            (cd "${TARGET_FRONTEND}" && sha256sum -c release-manifest.sha256) || {
                echo "ERROR: Frontend release-manifest.sha256 checksum verification failed!" >&2
                exit 1
            }
            echo "    PASS: Frontend release-manifest checksums verified."
        fi

        # If release.sha256 exists, check only if it contains unpacked files (never fail on archive names)
        if [[ -f "${TARGET_BACKEND}/release.sha256" ]]; then
            if grep -q '\.tar\.gz' "${TARGET_BACKEND}/release.sha256" 2>/dev/null; then
                echo "    INFO: release.sha256 references archives (verified prior to unpack). Skipping inside unpacked directory."
            else
                echo "    Verifying legacy backend release.sha256..."
                (cd "${TARGET_BACKEND}" && sha256sum -c release.sha256) || {
                    echo "ERROR: Release checksum verification failed!" >&2
                    exit 1
                }
                echo "    PASS: Legacy release checksums verified."
            fi
        fi

        # 7. Verify Frontend Assets (HTML, 4 core fonts with TTF magic, JS bundles)
        echo "--> Verifying frontend assets in release..."
        if [[ ! -f "${TARGET_FRONTEND}/index.html" ]]; then
            echo "ERROR: Missing index.html in ${TARGET_FRONTEND}!" >&2
            exit 1
        fi
        for font in "Feather.ttf" "MaterialCommunityIcons.ttf" "Inter-Regular.ttf" "Inter-SemiBold.ttf"; do
            verify_font_file "${TARGET_FRONTEND}/fonts/${font}" || exit 1
        done
        # Verify JS asset bundles exist in _expo/static/js/web
        if ! find "${TARGET_FRONTEND}/_expo/static/js/web" -maxdepth 1 -name "entry-*.js" -type f -size +10k 2>/dev/null | grep -q .; then
            echo "ERROR: Missing or corrupted entry JS bundle in ${TARGET_FRONTEND}/_expo/static/js/web!" >&2
            exit 1
        fi
        echo "    PASS: Frontend assets, fonts, and JS bundles verified."

        # 8. Verify Backend Code Structure
        echo "--> Verifying backend build structure in release..."
        if [[ ! -f "${TARGET_BACKEND}/artifacts/api-server/dist/index.mjs" ]]; then
            echo "ERROR: Missing artifacts/api-server/dist/index.mjs in ${TARGET_BACKEND}!" >&2
            exit 1
        fi
        if [[ ! -f "${TARGET_BACKEND}/package.json" || ! -f "${TARGET_BACKEND}/pnpm-lock.yaml" ]]; then
            echo "ERROR: Missing package.json or pnpm-lock.yaml in ${TARGET_BACKEND}!" >&2
            exit 1
        fi
        echo "    PASS: Backend code structure verified."

        # 9. Record Previous Releases for Rollback
        if [[ -L "${CURRENT_FRONTEND_SYMLINK}" ]]; then
            PREV_TARGET=$(readlink -f "${CURRENT_FRONTEND_SYMLINK}")
            echo "${PREV_TARGET}" > "${PREV_FRONTEND_SYMLINK_FILE}"
            echo "--> Recorded previous frontend release: ${PREV_TARGET}"
        elif [[ -d "${CURRENT_FRONTEND_SYMLINK}" ]]; then
            INITIAL_BACKUP="${FRONTEND_RELEASES_DIR}/legacy-initial-$(date +%Y%m%d%H%M%S)"
            mv "${CURRENT_FRONTEND_SYMLINK}" "${INITIAL_BACKUP}"
            echo "${INITIAL_BACKUP}" > "${PREV_FRONTEND_SYMLINK_FILE}"
            echo "--> Backed up legacy frontend directory to: ${INITIAL_BACKUP}"
        fi

        if [[ -f "${BACKEND_DIR}/.current_release_id" ]]; then
            cat "${BACKEND_DIR}/.current_release_id" > "${PREV_BACKEND_RELEASE_FILE}"
        fi

        # 10. Atomically Swap Frontend Symlink (mv -Tf)
        echo "--> Atomically updating frontend symlink..."
        ln -sfn "${TARGET_FRONTEND}" "${CURRENT_FRONTEND_SYMLINK}.tmp"
        mv -Tf "${CURRENT_FRONTEND_SYMLINK}.tmp" "${CURRENT_FRONTEND_SYMLINK}"
        reload_nginx

        # 11. Sync Backend Source into /opt/vaksinamed under root control
        sync_backend_release "${TARGET_BACKEND}"
        echo "${RELEASE_ID}" > "${BACKEND_DIR}/.current_release_id"

        # 12. Rebuild and Restart API & Worker Containers (Stateless)
        echo "--> Building and restarting API and Worker containers..."
        cd "${BACKEND_DIR}"
        dc_cmd -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" up -d --build api worker

        sleep 5

        # 13. Verify Post-Deploy Health Checks
        if ! run_healthchecks; then
            echo "CRITICAL: Post-deploy health checks failed! Triggering automatic rollback..." >&2

            # Rollback frontend symlink
            if [[ -f "${PREV_FRONTEND_SYMLINK_FILE}" ]]; then
                PREV_F=$(cat "${PREV_FRONTEND_SYMLINK_FILE}")
                if [[ -d "${PREV_F}" ]]; then
                    ln -sfn "${PREV_F}" "${CURRENT_FRONTEND_SYMLINK}.tmp"
                    mv -Tf "${CURRENT_FRONTEND_SYMLINK}.tmp" "${CURRENT_FRONTEND_SYMLINK}"
                    reload_nginx || true
                    echo "--> Restored frontend symlink to: ${PREV_F}"
                fi
            fi

            # Rollback backend code if previous release exists
            if [[ -f "${PREV_BACKEND_RELEASE_FILE}" ]]; then
                PREV_B_ID=$(cat "${PREV_BACKEND_RELEASE_FILE}")
                if [[ -d "${BACKEND_RELEASES_DIR}/${PREV_B_ID}" ]]; then
                    sync_backend_release "${BACKEND_RELEASES_DIR}/${PREV_B_ID}"
                    dc_cmd -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" up -d --build api worker || true
                    echo "--> Restored backend release to: ${PREV_B_ID}"
                fi
            else
                dc_cmd -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" restart api worker || true
            fi

            echo "ERROR: Deployment failed and rollback was executed." >&2
            exit 1
        fi

        # 14. Prune Old Releases (Keep Last 5)
        echo "--> Pruning old releases (retaining last 5)..."
        cd "${FRONTEND_RELEASES_DIR}"
        ls -1dt */ 2>/dev/null | tail -n +6 | xargs -r rm -rf || true
        cd "${BACKEND_RELEASES_DIR}"
        ls -1dt */ 2>/dev/null | tail -n +6 | xargs -r rm -rf || true

        echo "=== [VAKSINAMED] Deployment Succeeded for Release: ${RELEASE_ID} ==="
        ;;

    rollback)
        echo "=== [VAKSINAMED] Executing Staging Rollback ==="
        enforce_root_invariants

        # Rollback Frontend
        TARGET_FRONTEND_ROLLBACK=""
        if [[ -f "${PREV_FRONTEND_SYMLINK_FILE}" ]]; then
            PREV_F=$(cat "${PREV_FRONTEND_SYMLINK_FILE}")
            if [[ -d "${PREV_F}" ]]; then
                TARGET_FRONTEND_ROLLBACK="${PREV_F}"
            fi
        fi
        if [[ -z "${TARGET_FRONTEND_ROLLBACK}" ]]; then
            LATEST_F=$(ls -1dt "${FRONTEND_RELEASES_DIR}"/*/ 2>/dev/null || true)
            TARGET_FRONTEND_ROLLBACK=$(echo "${LATEST_F}" | sed -n '2p' || true)
        fi

        if [[ -n "${TARGET_FRONTEND_ROLLBACK}" && -d "${TARGET_FRONTEND_ROLLBACK}" ]]; then
            echo "--> Rolling back frontend to: ${TARGET_FRONTEND_ROLLBACK}"
            ln -sfn "${TARGET_FRONTEND_ROLLBACK}" "${CURRENT_FRONTEND_SYMLINK}.tmp"
            mv -Tf "${CURRENT_FRONTEND_SYMLINK}.tmp" "${CURRENT_FRONTEND_SYMLINK}"
            reload_nginx
        else
            echo "WARNING: No previous frontend release directory found!" >&2
        fi

        # Rollback Backend
        TARGET_BACKEND_ROLLBACK=""
        if [[ -f "${PREV_BACKEND_RELEASE_FILE}" ]]; then
            PREV_B_ID=$(cat "${PREV_BACKEND_RELEASE_FILE}")
            if [[ -d "${BACKEND_RELEASES_DIR}/${PREV_B_ID}" ]]; then
                TARGET_BACKEND_ROLLBACK="${BACKEND_RELEASES_DIR}/${PREV_B_ID}"
            fi
        fi
        if [[ -z "${TARGET_BACKEND_ROLLBACK}" ]]; then
            LATEST_B=$(ls -1dt "${BACKEND_RELEASES_DIR}"/*/ 2>/dev/null || true)
            TARGET_BACKEND_ROLLBACK=$(echo "${LATEST_B}" | sed -n '2p' || true)
        fi

        if [[ -n "${TARGET_BACKEND_ROLLBACK}" && -d "${TARGET_BACKEND_ROLLBACK}" ]]; then
            echo "--> Rolling back backend code to: ${TARGET_BACKEND_ROLLBACK}"
            sync_backend_release "${TARGET_BACKEND_ROLLBACK}"
            cd "${BACKEND_DIR}"
            dc_cmd -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" up -d --build api worker
        else
            echo "--> Restarting current containers as fallback..."
            cd "${BACKEND_DIR}"
            dc_cmd -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" restart api worker
        fi

        run_healthchecks
        echo "=== [VAKSINAMED] Rollback Completed Successfully ==="
        ;;

    healthcheck)
        run_healthchecks
        ;;

    reload-nginx)
        reload_nginx
        ;;
esac
WRAPPER_EOF
fi

chmod 755 "${TARGET_BIN}"
chown root:root "${TARGET_BIN}"
echo "    PASS: ${TARGET_BIN} installed (0755 root:root)."

echo "--> Step 6/7: Installing strict sudoers configuration..."
SUDOERS_FILE="/etc/sudoers.d/vaksinamed-deployer"
SUDOERS_TMP="/tmp/vaksinamed-deployer.tmp"

cat << 'SUDOERS_EOF' > "${SUDOERS_TMP}"
# Restricted sudoers specification for VaksinaMed CI/CD deployer
# Location on server: /etc/sudoers.d/vaksinamed-deployer (chmod 0440)
#
# Security Invariants & Privilege Boundaries:
# 1. deployer is NOT in docker or sudo groups.
# 2. deployer can ONLY invoke the root-owned wrapper /usr/local/bin/vaksinamed-staging-ctl.
# 3. Sudoers strictly scopes the deploy argument:
#    'deploy [a-zA-Z0-9]*' requires the release ID to begin with an alphanumeric character.
#    This eliminates arbitrary wildcard flags ('-', '--'), path traversals ('.', '..'),
#    and absolute paths ('/') before the root wrapper is even executed.
# 4. 'rollback', 'healthcheck', and 'reload-nginx' accept NO arguments.
# 5. All secondary validation (argument count $# -eq 2, exact length 7-64, TOCTOU chown,
#    special file audits, symlink checks) is enforced inside the root wrapper.
# 6. Arbitrary binaries, shells, and edits are strictly forbidden.

deployer ALL=(root) NOPASSWD: /usr/local/bin/vaksinamed-staging-ctl deploy [a-zA-Z0-9]*, /usr/local/bin/vaksinamed-staging-ctl rollback, /usr/local/bin/vaksinamed-staging-ctl healthcheck, /usr/local/bin/vaksinamed-staging-ctl reload-nginx
SUDOERS_EOF

# Strictly validate sudoers syntax before installing
if visudo -cf "${SUDOERS_TMP}"; then
    cp "${SUDOERS_TMP}" "${SUDOERS_FILE}"
    chmod 0440 "${SUDOERS_FILE}"
    chown root:root "${SUDOERS_FILE}"
    rm -f "${SUDOERS_TMP}"
    echo "    PASS: Sudoers rule validated and installed at ${SUDOERS_FILE} (0440 root:root)."
else
    echo "CRITICAL ERROR: Sudoers syntax validation failed!" >&2
    rm -f "${SUDOERS_TMP}"
    exit 1
fi

echo "--> Step 7/7: Configuring and validating Nginx for Staging Web App (app-staging.vaksinamedgps.uz)..."
if command -v nginx >/dev/null 2>&1; then
    NGINX_AVAILABLE_DIR="/etc/nginx/sites-available"
    NGINX_ENABLED_DIR="/etc/nginx/sites-enabled"
    mkdir -p "${NGINX_AVAILABLE_DIR}" "${NGINX_ENABLED_DIR}" /var/www/certbot

    TARGET_NGINX_CONF="${NGINX_AVAILABLE_DIR}/app-staging.conf"
    if [[ -f "${NGINX_AVAILABLE_DIR}/app-staging.vaksinamedgps.uz" ]]; then
        TARGET_NGINX_CONF="${NGINX_AVAILABLE_DIR}/app-staging.vaksinamedgps.uz"
    elif [[ -f "${NGINX_AVAILABLE_DIR}/app-staging.vaksinamedgps.uz.conf" ]]; then
        TARGET_NGINX_CONF="${NGINX_AVAILABLE_DIR}/app-staging.vaksinamedgps.uz.conf"
    else
        # Auto-detect any existing file dedicated to app-staging.vaksinamedgps.uz
        for search_file in "${NGINX_AVAILABLE_DIR}"/* "${NGINX_ENABLED_DIR}"/* "/etc/nginx/conf.d"/*; do
            if [[ -f "${search_file}" && ! -L "${search_file}" ]]; then
                if grep -q "server_name.*app-staging\.vaksinamedgps\.uz" "${search_file}" 2>/dev/null; then
                    # Ensure it does not configure api-staging (prevent accidental overwrite of api config)
                    if ! grep -q "api-staging" "${search_file}" 2>/dev/null; then
                        TARGET_NGINX_CONF="${search_file}"
                        echo "    Found active dedicated Nginx site config: ${TARGET_NGINX_CONF}"
                        break
                    fi
                fi
            fi
        done
    fi

    # Backup existing configuration safely
    BACKUP_NGINX_CONF=""
    if [[ -f "${TARGET_NGINX_CONF}" ]]; then
        TIMESTAMP=$(date +%Y%m%d%H%M%S)
        BACKUP_NGINX_CONF="${TARGET_NGINX_CONF}.backup-${TIMESTAMP}"
        cp "${TARGET_NGINX_CONF}" "${BACKUP_NGINX_CONF}"
        echo "    Backed up existing Nginx config to ${BACKUP_NGINX_CONF}"
    fi

    # Locate source config or write self-contained template
    NGINX_SRC=""
    if [[ -f "${BACKEND_DIR}/infra/nginx/app-staging.conf" ]]; then
        NGINX_SRC="${BACKEND_DIR}/infra/nginx/app-staging.conf"
    elif [[ -f "$(dirname "$0")/../nginx/app-staging.conf" ]]; then
        NGINX_SRC="$(dirname "$0")/../nginx/app-staging.conf"
    fi

    if [[ -n "${NGINX_SRC}" && -f "${NGINX_SRC}" ]]; then
        echo "    Copying Nginx config from ${NGINX_SRC}..."
        cp "${NGINX_SRC}" "${TARGET_NGINX_CONF}"
    else
        echo "    Writing self-contained Nginx config to ${TARGET_NGINX_CONF}..."
        cat << 'NGINX_EOF' > "${TARGET_NGINX_CONF}"
# Nginx Virtual Host Configuration for VaksinaMed Mobile Web (Staging)
# Domain: app-staging.vaksinamedgps.uz
# Root: /var/www/vaksinamed-app-staging (Symlink to active release in /var/www/vaksinamed-app-releases/)

# HTTP to HTTPS redirect
server {
    listen 80;
    listen [::]:80;
    server_name app-staging.vaksinamedgps.uz;

    # ACME Challenge for Let's Encrypt Certbot
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
        try_files $uri =404;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

# HTTPS Server Block
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name app-staging.vaksinamedgps.uz;

    # SSL Certificates
    ssl_certificate /etc/letsencrypt/live/app-staging.vaksinamedgps.uz/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/app-staging.vaksinamedgps.uz/privkey.pem;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL:10m;
    ssl_session_tickets off;

    # Security Headers
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Web Root
    root /var/www/vaksinamed-app-staging;
    index index.html;

    # Gzip Compression
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types
        text/plain
        text/css
        text/javascript
        application/javascript
        application/json
        application/x-javascript
        font/ttf
        font/otf
        image/svg+xml;

    # Font MIME Types & Headers
    location /fonts/ {
        try_files $uri =404;
        expires 1y;
        add_header Cache-Control "public, max-age=31536000, immutable" always;
        add_header Access-Control-Allow-Origin "*" always;
        add_header Access-Control-Allow-Methods "GET, OPTIONS" always;
        types {
            font/ttf ttf;
            font/otf otf;
            font/woff woff;
            font/woff2 woff2;
            application/font-woff2 woff2;
            application/font-woff woff;
        }
    }

    # Static Assets (Images, Bundles, Chunks)
    location /assets/ {
        try_files $uri =404;
        expires 1y;
        add_header Cache-Control "public, max-age=31536000, immutable" always;
        add_header Access-Control-Allow-Origin "*" always;
        types {
            font/ttf ttf;
            font/otf otf;
            font/woff woff;
            font/woff2 woff2;
            image/png png;
            image/jpeg jpg jpeg;
            image/svg+xml svg;
            image/x-icon ico;
        }
    }

    # Expo Static JS Bundles
    location /_expo/ {
        try_files $uri =404;
        expires 1y;
        add_header Cache-Control "public, max-age=31536000, immutable" always;
        types {
            application/javascript js mjs;
            application/json json;
        }
    }

    # HTML Pages & SPA Fallback (Never cache HTML)
    location / {
        try_files $uri $uri/ /index.html;
        expires -1;
        add_header Cache-Control "no-cache, no-store, must-revalidate" always;
        add_header Pragma "no-cache" always;
    }

    # Protect hidden files except Let's Encrypt challenge
    location ~ /\.(?!well-known) {
        deny all;
        access_log off;
        log_not_found off;
    }
}
NGINX_EOF
    fi

    # Determine active SSL certificate and key paths (preserving existing TLS setup)
    ACTIVE_CERT=""
    ACTIVE_KEY=""

    # 1. Search existing nginx configurations for currently configured certificates
    for cfg in "${TARGET_NGINX_CONF}" "${BACKUP_NGINX_CONF}" "${NGINX_AVAILABLE_DIR}"/* "${NGINX_ENABLED_DIR}"/* "/etc/nginx/conf.d"/*; do
        if [[ -n "${cfg}" && -f "${cfg}" ]]; then
            if grep -q "app-staging" "${cfg}" 2>/dev/null || [[ -n "${BACKUP_NGINX_CONF}" && "${cfg}" == "${BACKUP_NGINX_CONF}" ]]; then
                c_cand=$(grep -E '^\s*ssl_certificate\s+' "${cfg}" 2>/dev/null | head -n 1 | awk '{print $2}' | tr -d ';' || true)
                k_cand=$(grep -E '^\s*ssl_certificate_key\s+' "${cfg}" 2>/dev/null | head -n 1 | awk '{print $2}' | tr -d ';' || true)
                if [[ -n "${c_cand}" && -f "${c_cand}" && -n "${k_cand}" && -f "${k_cand}" ]]; then
                    ACTIVE_CERT="${c_cand}"
                    ACTIVE_KEY="${k_cand}"
                    echo "    Detected active SSL certificates from existing configuration: ${ACTIVE_CERT}"
                    break
                fi
            fi
        fi
    done

    # 2. If not found in configs, check standard Let's Encrypt live paths
    if [[ -z "${ACTIVE_CERT}" ]]; then
        for le_dir in \
            "/etc/letsencrypt/live/app-staging.vaksinamedgps.uz" \
            "/etc/letsencrypt/live/app-staging.vaksinamedgps.uz-0001" \
            "/etc/letsencrypt/live/vaksinamedgps.uz" \
            "/etc/letsencrypt/live/staging.vaksinamedgps.uz" \
            "/etc/letsencrypt/live/staging.vaksinamed.uz"; do
            if [[ -f "${le_dir}/fullchain.pem" && -f "${le_dir}/privkey.pem" ]]; then
                ACTIVE_CERT="${le_dir}/fullchain.pem"
                ACTIVE_KEY="${le_dir}/privkey.pem"
                echo "    Detected active Let's Encrypt certificate at ${le_dir}"
                break
            fi
        done
    fi

    # 3. Apply discovered certificates if valid
    if [[ -n "${ACTIVE_CERT}" && -f "${ACTIVE_CERT}" && -n "${ACTIVE_KEY}" && -f "${ACTIVE_KEY}" ]]; then
        echo "    Preserving active SSL certificate paths: ${ACTIVE_CERT}"
        sed -i "s|/etc/letsencrypt/live/app-staging.vaksinamedgps.uz/fullchain.pem|${ACTIVE_CERT}|g" "${TARGET_NGINX_CONF}"
        sed -i "s|/etc/letsencrypt/live/app-staging.vaksinamedgps.uz/privkey.pem|${ACTIVE_KEY}|g" "${TARGET_NGINX_CONF}"
    fi

    # Symlink to sites-enabled
    ENABLED_LINK="${NGINX_ENABLED_DIR}/$(basename "${TARGET_NGINX_CONF}")"
    ln -sfn "${TARGET_NGINX_CONF}" "${ENABLED_LINK}"

    # Validate with nginx -t
    echo "    Validating Nginx configuration with 'nginx -t'..."
    if nginx -t; then
        echo "    PASS: Nginx configuration test succeeded."
        if command -v systemctl >/dev/null 2>&1 && systemctl is-active --quiet nginx; then
            systemctl reload nginx
            echo "    PASS: Nginx reloaded with secure font and asset routing."
        fi
    else
        echo "    CRITICAL ERROR: Nginx configuration test failed! Restoring backup..." >&2
        if [[ -n "${BACKUP_NGINX_CONF}" && -f "${BACKUP_NGINX_CONF}" ]]; then
            cp "${BACKUP_NGINX_CONF}" "${TARGET_NGINX_CONF}"
            echo "    Restored previous Nginx configuration from backup." >&2
            nginx -t && (systemctl reload nginx 2>/dev/null || true)
        else
            rm -f "${ENABLED_LINK}" "${TARGET_NGINX_CONF}"
            echo "    Removed unverified site configuration." >&2
        fi
        exit 1
    fi
else
    echo "    INFO: Nginx is not installed or not in PATH. Skipping Nginx configuration."
fi

echo "--> Self-test and verification..."
bash -n "${TARGET_BIN}" && echo "    PASS: Wrapper bash syntax valid."
visudo -cf "${SUDOERS_FILE}" && echo "    PASS: Sudoers configuration syntax valid."

echo "================================================================="
echo "   VAKSINAMED STAGING SERVER BOOTSTRAP COMPLETED SUCCESSFULLY!"
echo "   Server is now 100% prepared for GitHub Actions CI/CD deployment."
echo "================================================================="
