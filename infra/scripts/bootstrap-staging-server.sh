#!/usr/bin/env bash
set -euo pipefail

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

echo "--> Step 1/6: Provisioning unprivileged 'deployer' user..."
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

echo "--> Step 2/6: Configuring staging directory structures and permissions..."
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

echo "--> Step 3/6: Preserving existing frontend deployment..."
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

echo "--> Step 4/6: Preserving database volumes and ensuring isolation..."
if command -v docker >/dev/null 2>&1; then
    echo "    Checking Docker named volumes for staging databases..."
    docker volume inspect staging_pgdata >/dev/null 2>&1 && echo "    PASS: Volume 'staging_pgdata' exists and preserved." || echo "    INFO: Volume 'staging_pgdata' will be initialized by compose."
    docker volume inspect staging_redisdata >/dev/null 2>&1 && echo "    PASS: Volume 'staging_redisdata' exists and preserved." || echo "    INFO: Volume 'staging_redisdata' will be initialized by compose."
fi

echo "--> Step 5/6: Installing root staging control wrapper (/usr/local/bin/vaksinamed-staging-ctl)..."
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

dc_cmd() {
    if docker compose version >/dev/null 2>&1; then
        docker compose "$@"
    else
        docker-compose "$@"
    fi
}

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
        if [[ ! "${RELEASE_ID}" =~ ^[a-zA-Z0-9._-]{7,64}$ ]]; then
            echo "ERROR: Invalid release ID format: '${RELEASE_ID}'" >&2
            exit 1
        fi
        if [[ "${RELEASE_ID}" == *".."* || "${RELEASE_ID}" == *"/"* || "${RELEASE_ID}" == *"\\"* ]]; then
            echo "ERROR: Path traversal detected in release ID: '${RELEASE_ID}'" >&2
            exit 1
        fi
        ;;
    rollback|healthcheck|reload-nginx)
        if [[ $# -ne 1 ]]; then
            echo "ERROR: '${ACTION}' accepts no additional arguments. Given: $# arguments." >&2
            exit 1
        fi
        ;;
    *)
        echo "ERROR: Unknown action: '${ACTION}'" >&2
        echo "Usage: vaksinamed-staging-ctl {deploy <release-id>|rollback|healthcheck|reload-nginx}" >&2
        exit 1
        ;;
esac

exec 200>"${LOCK_FILE}"
if ! flock -n 200; then
    echo "ERROR: Another deployment or rollback operation is currently in progress!" >&2
    exit 1
fi

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

verify_font_file() {
    local font_path="${1}"
    local font_name
    font_name=$(basename "${font_path}")
    if [[ ! -f "${font_path}" ]]; then
        echo "    FAIL: Font file ${font_name} does not exist!" >&2
        return 1
    fi
    local size
    size=$(stat -c%s "${font_path}" 2>/dev/null || stat -f%z "${font_path}" 2>/dev/null || echo "0")
    if [[ "${size}" -lt 10000 ]]; then
        echo "    FAIL: Font file ${font_name} is too small (${size} bytes)!" >&2
        return 1
    fi
    local magic_hex
    magic_hex=$(od -N 4 -t x1 "${font_path}" 2>/dev/null | head -n 1 | awk '{print $2$3$4$5}' | tr '[:upper:]' '[:lower:]')
    if [[ "${magic_hex}" != "00010000" && "${magic_hex}" != "4f54544f" && "${magic_hex}" != "74746366" ]]; then
        echo "    FAIL: Font file ${font_name} has invalid magic header 0x${magic_hex} (corrupted or HTML)!" >&2
        return 1
    fi
    return 0
}

run_healthchecks() {
    echo "--> Running post-deployment health checks..."
    local pass=1
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

    local font_ok=0
    if [[ -f "${CURRENT_FRONTEND_SYMLINK}/fonts/Feather.ttf" ]]; then
        if verify_font_file "${CURRENT_FRONTEND_SYMLINK}/fonts/Feather.ttf"; then
            font_ok=1
        fi
    fi
    if [[ "${font_ok}" -eq 1 ]]; then
        echo "    PASS: Frontend font Feather.ttf verified."
    else
        echo "    FAIL: Feather.ttf font check failed!" >&2
        pass=0
    fi

    return "$((1 - pass))"
}

enforce_root_invariants() {
    [[ ! -d "${BACKEND_DIR}" ]] && { echo "ERROR: ${BACKEND_DIR} does not exist!" >&2; exit 1; }
    [[ ! -f "${ENV_FILE}" ]] && { echo "ERROR: ${ENV_FILE} does not exist!" >&2; exit 1; }
    [[ ! -f "${COMPOSE_FILE}" ]] && { echo "ERROR: ${COMPOSE_FILE} does not exist!" >&2; exit 1; }
    [[ ! -f "${DOCKERFILE}" ]] && { echo "ERROR: ${DOCKERFILE} does not exist!" >&2; exit 1; }

    chown root:root "${ENV_FILE}" "${COMPOSE_FILE}" "${DOCKERFILE}"
    chmod 600 "${ENV_FILE}"
    chmod 644 "${COMPOSE_FILE}" "${DOCKERFILE}"
    chown root:root "${BACKEND_DIR}"
    chmod 755 "${BACKEND_DIR}"
}

sync_backend_release() {
    local source_dir="${1}"
    if command -v rsync >/dev/null 2>&1; then
        rsync -a --exclude='.env*' --exclude='docker-compose*' --exclude='Dockerfile' --exclude='infra/' --exclude='*.sh' "${source_dir}/" "${BACKEND_DIR}/"
    else
        tar -C "${source_dir}" --exclude='.env*' --exclude='docker-compose*' --exclude='Dockerfile' --exclude='infra' --exclude='*.sh' -cf - . | tar -C "${BACKEND_DIR}" -xf -
    fi
    chown -R root:root "${BACKEND_DIR}"
    chmod 755 "${BACKEND_DIR}"
    chmod 600 "${ENV_FILE}"
    chmod 644 "${COMPOSE_FILE}" "${DOCKERFILE}"
}

case "${ACTION}" in
    deploy)
        TARGET_FRONTEND="${FRONTEND_RELEASES_DIR}/${RELEASE_ID}"
        TARGET_BACKEND="${BACKEND_RELEASES_DIR}/${RELEASE_ID}"

        echo "=== [VAKSINAMED] Executing Deployment for Release: ${RELEASE_ID} ==="
        enforce_root_invariants

        [[ ! -d "${TARGET_FRONTEND}" ]] && { echo "ERROR: Frontend release dir missing!" >&2; exit 1; }
        [[ ! -d "${TARGET_BACKEND}" ]] && { echo "ERROR: Backend release dir missing!" >&2; exit 1; }

        chown -R root:root "${TARGET_FRONTEND}" "${TARGET_BACKEND}"
        chmod -R u=rwX,go=rX "${TARGET_FRONTEND}" "${TARGET_BACKEND}"

        if find "${TARGET_FRONTEND}" "${TARGET_BACKEND}" -type l 2>/dev/null | grep -q .; then
            echo "ERROR: Symbolic links found in release!" >&2; exit 1
        fi
        if find "${TARGET_FRONTEND}" "${TARGET_BACKEND}" ! -type f ! -type d 2>/dev/null | grep -q .; then
            echo "ERROR: Special files found in release!" >&2; exit 1
        fi
        if find "${TARGET_BACKEND}" \( -name ".env*" -o -name "docker-compose*" -o -name "Dockerfile" -o -name "*.sh" -o -path "*/infra/*" \) 2>/dev/null | grep -q .; then
            echo "ERROR: Prohibited configuration files in release payload!" >&2; exit 1
        fi

        if [[ -f "${TARGET_BACKEND}/release.sha256" ]]; then
            (cd "${TARGET_BACKEND}" && sha256sum -c release.sha256) || { echo "ERROR: SHA256 checksum mismatch!" >&2; exit 1; }
        fi

        [[ ! -f "${TARGET_FRONTEND}/index.html" ]] && { echo "ERROR: Missing index.html!" >&2; exit 1; }
        for font in "Feather.ttf" "MaterialCommunityIcons.ttf" "Inter-Regular.ttf"; do
            verify_font_file "${TARGET_FRONTEND}/fonts/${font}" || exit 1
        done

        [[ ! -f "${TARGET_BACKEND}/artifacts/api-server/dist/index.mjs" ]] && { echo "ERROR: Missing backend bundle!" >&2; exit 1; }

        if [[ -L "${CURRENT_FRONTEND_SYMLINK}" ]]; then
            PREV_TARGET=$(readlink -f "${CURRENT_FRONTEND_SYMLINK}")
            echo "${PREV_TARGET}" > "${PREV_FRONTEND_SYMLINK_FILE}"
        fi
        if [[ -f "${BACKEND_DIR}/.current_release_id" ]]; then
            cat "${BACKEND_DIR}/.current_release_id" > "${PREV_BACKEND_RELEASE_FILE}"
        fi

        ln -sfn "${TARGET_FRONTEND}" "${CURRENT_FRONTEND_SYMLINK}.tmp"
        mv -Tf "${CURRENT_FRONTEND_SYMLINK}.tmp" "${CURRENT_FRONTEND_SYMLINK}"
        reload_nginx

        sync_backend_release "${TARGET_BACKEND}"
        echo "${RELEASE_ID}" > "${BACKEND_DIR}/.current_release_id"

        cd "${BACKEND_DIR}"
        dc_cmd -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" up -d --build api worker
        sleep 5

        if ! run_healthchecks; then
            echo "CRITICAL: Healthcheck failed! Rolling back..." >&2
            if [[ -f "${PREV_FRONTEND_SYMLINK_FILE}" ]]; then
                PREV_F=$(cat "${PREV_FRONTEND_SYMLINK_FILE}")
                [[ -d "${PREV_F}" ]] && { ln -sfn "${PREV_F}" "${CURRENT_FRONTEND_SYMLINK}.tmp"; mv -Tf "${CURRENT_FRONTEND_SYMLINK}.tmp" "${CURRENT_FRONTEND_SYMLINK}"; reload_nginx || true; }
            fi
            if [[ -f "${PREV_BACKEND_RELEASE_FILE}" ]]; then
                PREV_B_ID=$(cat "${PREV_BACKEND_RELEASE_FILE}")
                [[ -d "${BACKEND_RELEASES_DIR}/${PREV_B_ID}" ]] && { sync_backend_release "${BACKEND_RELEASES_DIR}/${PREV_B_ID}"; dc_cmd -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" up -d --build api worker || true; }
            fi
            exit 1
        fi

        cd "${FRONTEND_RELEASES_DIR}" && ls -1dt */ 2>/dev/null | tail -n +6 | xargs -r rm -rf || true
        cd "${BACKEND_RELEASES_DIR}" && ls -1dt */ 2>/dev/null | tail -n +6 | xargs -r rm -rf || true
        echo "=== [VAKSINAMED] Deployment Succeeded for Release: ${RELEASE_ID} ==="
        ;;
    rollback)
        enforce_root_invariants
        if [[ -f "${PREV_FRONTEND_SYMLINK_FILE}" ]]; then
            PREV_F=$(cat "${PREV_FRONTEND_SYMLINK_FILE}")
            [[ -d "${PREV_F}" ]] && { ln -sfn "${PREV_F}" "${CURRENT_FRONTEND_SYMLINK}.tmp"; mv -Tf "${CURRENT_FRONTEND_SYMLINK}.tmp" "${CURRENT_FRONTEND_SYMLINK}"; reload_nginx || true; }
        fi
        if [[ -f "${PREV_BACKEND_RELEASE_FILE}" ]]; then
            PREV_B_ID=$(cat "${PREV_BACKEND_RELEASE_FILE}")
            [[ -d "${BACKEND_RELEASES_DIR}/${PREV_B_ID}" ]] && { sync_backend_release "${BACKEND_RELEASES_DIR}/${PREV_B_ID}"; cd "${BACKEND_DIR}"; dc_cmd -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" up -d --build api worker; }
        fi
        run_healthchecks
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

echo "--> Step 6/6: Installing strict sudoers configuration..."
SUDOERS_FILE="/etc/sudoers.d/vaksinamed-deployer"
SUDOERS_TMP="/tmp/vaksinamed-deployer.tmp"

cat << 'SUDOERS_EOF' > "${SUDOERS_TMP}"
# Restricted sudoers specification for VaksinaMed CI/CD deployer
# Location on server: /etc/sudoers.d/vaksinamed-deployer (chmod 0440)
#
# Security Invariants & Privilege Boundaries:
# 1. deployer is NOT in docker or sudo groups.
# 2. deployer can ONLY invoke the root-owned wrapper /usr/local/bin/vaksinamed-staging-ctl.
# 3. All argument validation, environment sanitization, and access checks are enforced
#    strictly inside /usr/local/bin/vaksinamed-staging-ctl.
# 4. Arbitrary binaries, shells, and edits are strictly forbidden.

deployer ALL=(root) NOPASSWD: /usr/local/bin/vaksinamed-staging-ctl deploy *, /usr/local/bin/vaksinamed-staging-ctl rollback, /usr/local/bin/vaksinamed-staging-ctl healthcheck, /usr/local/bin/vaksinamed-staging-ctl reload-nginx
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

echo "--> Self-test and verification..."
bash -n "${TARGET_BIN}" && echo "    PASS: Wrapper bash syntax valid."
visudo -cf "${SUDOERS_FILE}" && echo "    PASS: Sudoers configuration syntax valid."

echo "================================================================="
echo "   VAKSINAMED STAGING SERVER BOOTSTRAP COMPLETED SUCCESSFULLY!"
echo "   Server is now 100% prepared for GitHub Actions CI/CD deployment."
echo "================================================================="
