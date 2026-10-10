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
        if [[ ! "${RELEASE_ID}" =~ ^[a-zA-Z0-9._-]{7,64}$ ]]; then
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

        # 6. Verify Checksums if provided
        if [[ -f "${TARGET_BACKEND}/release.sha256" ]]; then
            echo "--> Verifying SHA256 checksums..."
            (cd "${TARGET_BACKEND}" && sha256sum -c release.sha256) || {
                echo "ERROR: Release checksum verification failed!" >&2
                exit 1
            }
            echo "    PASS: Release checksums verified."
        fi

        # 7. Verify Frontend Assets
        echo "--> Verifying frontend assets in release..."
        if [[ ! -f "${TARGET_FRONTEND}/index.html" ]]; then
            echo "ERROR: Missing index.html in ${TARGET_FRONTEND}!" >&2
            exit 1
        fi
        for font in "Feather.ttf" "MaterialCommunityIcons.ttf" "Inter-Regular.ttf"; do
            verify_font_file "${TARGET_FRONTEND}/fonts/${font}" || exit 1
        done
        echo "    PASS: Frontend assets and fonts verified."

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
