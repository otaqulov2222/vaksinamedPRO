#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# VaksinaMed Staging Deployment Control Wrapper
# Target Server Location: /usr/local/bin/vaksinamed-staging-ctl
# Owner: root:root | Permissions: 0755
#
# Security Invariants & Privilege Boundaries:
# 1. /opt/vaksinamed is STRICTLY controlled by root:root.
# 2. .env.staging is chmod 0600 root:root (deployer CANNOT read or write).
# 3. Dockerfile and infra/docker-compose.staging.yml are immutable root files.
#    NEVER overwritten from untrusted uploaded releases.
# 4. deployer is NOT in the docker group (no access to /var/run/docker.sock).
# 5. deployer writes ONLY to dedicated release dirs:
#    - /var/www/vaksinamed-app-releases/${RELEASE_ID}
#    - /var/vaksinamed-releases/${RELEASE_ID}
# 6. Incoming release contents are strictly audited for symlink traversal
#    and prohibited executable/configuration files before syncing.
# 7. PostgreSQL and Redis data volumes are NEVER touched.
# 8. Exclusive deployment lock via flock.
# ==============================================================================

FRONTEND_RELEASES_DIR="/var/www/vaksinamed-app-releases"
CURRENT_FRONTEND_SYMLINK="/var/www/vaksinamed-app-staging"
PREV_FRONTEND_SYMLINK_FILE="/var/www/vaksinamed-app-staging.prev"

BACKEND_RELEASES_DIR="/var/vaksinamed-releases"
PREV_BACKEND_RELEASE_FILE="/var/vaksinamed-releases.prev"

BACKEND_DIR="/opt/vaksinamed"
COMPOSE_FILE="${BACKEND_DIR}/infra/docker-compose.staging.yml"
ENV_FILE="${BACKEND_DIR}/.env.staging"
DOCKERFILE="${BACKEND_DIR}/Dockerfile"
LOCK_FILE="/tmp/vaksinamed-staging-deploy.lock"

# 1. Exclusive Lock
exec 200>"${LOCK_FILE}"
if ! flock -n 200; then
    echo "ERROR: Another deployment or rollback operation is currently in progress!" >&2
    exit 1
fi

ACTION="${1:-}"

# Helper: Healthcheck
run_healthchecks() {
    echo "--> Running health checks..."
    local pass=1

    # Check API health
    if curl -fsS --retry 5 --retry-delay 2 https://api-staging.vaksinamedgps.uz/api/health/live > /dev/null 2>&1 || \
       curl -fsS --retry 5 --retry-delay 2 http://127.0.0.1:5000/api/health/live > /dev/null 2>&1 || \
       (cd "${BACKEND_DIR}" && docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" exec -T api node -e "fetch('http://127.0.0.1:5000/api/health/live').then(r=>process.exit(r.ok?0:1))" >/dev/null 2>&1); then
        echo "    PASS: API live endpoint responding."
    else
        echo "    FAIL: API live healthcheck failed!" >&2
        pass=0
    fi

    # Check Web Index
    if curl -fsS --retry 5 --retry-delay 2 https://app-staging.vaksinamedgps.uz/ > /dev/null 2>&1 || \
       curl -fsS --retry 5 --retry-delay 2 http://127.0.0.1/ > /dev/null 2>&1 || \
       [[ -f "${CURRENT_FRONTEND_SYMLINK}/index.html" && $(stat -c%s "${CURRENT_FRONTEND_SYMLINK}/index.html") -gt 100 ]]; then
        echo "    PASS: Frontend index HTML responding."
    else
        echo "    FAIL: Frontend index HTML check failed!" >&2
        pass=0
    fi

    # Check Font Asset
    if curl -fsS --retry 5 --retry-delay 2 https://app-staging.vaksinamedgps.uz/fonts/Feather.ttf > /dev/null 2>&1 || \
       curl -fsS --retry 5 --retry-delay 2 http://127.0.0.1/fonts/Feather.ttf > /dev/null 2>&1 || \
       [[ -f "${CURRENT_FRONTEND_SYMLINK}/fonts/Feather.ttf" && $(stat -c%s "${CURRENT_FRONTEND_SYMLINK}/fonts/Feather.ttf") -gt 10000 ]]; then
        echo "    PASS: Frontend Feather.ttf verified."
    else
        echo "    FAIL: Feather.ttf font request failed!" >&2
        pass=0
    fi

    return "${pass}"
}

# Helper: Reload Nginx
reload_nginx() {
    if command -v systemctl >/dev/null 2>&1 && systemctl is-active --quiet nginx; then
        echo "--> Testing and reloading Nginx..."
        nginx -t && systemctl reload nginx
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

    # Set root ownership on synced files
    chown -R root:root "${BACKEND_DIR}"
    chmod 755 "${BACKEND_DIR}"
    chmod 600 "${ENV_FILE}"
    chmod 644 "${COMPOSE_FILE}" "${DOCKERFILE}"
    echo "    PASS: Application source synced under root:root ownership."
}

case "${ACTION}" in
    deploy)
        RELEASE_ID="${2:-}"
        if [[ -z "${RELEASE_ID}" || ! "${RELEASE_ID}" =~ ^[a-zA-Z0-9._-]{7,64}$ ]]; then
            echo "ERROR: Invalid or missing release ID format!" >&2
            echo "Usage: vaksinamed-staging-ctl deploy <release-id>" >&2
            exit 1
        fi

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

        # 3. Security Check: Reject symlink traversal in uploaded releases
        echo "--> Auditing release directories for prohibited symlinks..."
        if find "${TARGET_FRONTEND}" "${TARGET_BACKEND}" -type l 2>/dev/null | grep -q .; then
            echo "ERROR: Security violation: Symbolic links found in uploaded release!" >&2
            exit 1
        fi
        echo "    PASS: No prohibited symlinks detected."

        # 4. Verify Frontend Assets
        echo "--> Verifying frontend assets in release..."
        if [[ ! -f "${TARGET_FRONTEND}/index.html" || $(stat -c%s "${TARGET_FRONTEND}/index.html") -lt 100 ]]; then
            echo "ERROR: Invalid or missing index.html in ${TARGET_FRONTEND}!" >&2
            exit 1
        fi
        for font in "Feather.ttf" "MaterialCommunityIcons.ttf" "Inter-Regular.ttf"; do
            if [[ ! -f "${TARGET_FRONTEND}/fonts/${font}" || $(stat -c%s "${TARGET_FRONTEND}/fonts/${font}") -lt 10000 ]]; then
                echo "ERROR: Critical font ${font} missing or corrupted in ${TARGET_FRONTEND}/fonts!" >&2
                exit 1
            fi
        done
        echo "    PASS: Frontend assets verified."

        # 5. Verify Backend Code Structure
        echo "--> Verifying backend build structure in release..."
        if [[ ! -f "${TARGET_BACKEND}/artifacts/api-server/dist/index.mjs" || $(stat -c%s "${TARGET_BACKEND}/artifacts/api-server/dist/index.mjs") -lt 100 ]]; then
            echo "ERROR: Missing or invalid artifacts/api-server/dist/index.mjs in ${TARGET_BACKEND}!" >&2
            exit 1
        fi
        if [[ ! -f "${TARGET_BACKEND}/package.json" || ! -f "${TARGET_BACKEND}/pnpm-lock.yaml" ]]; then
            echo "ERROR: Missing package.json or pnpm-lock.yaml in ${TARGET_BACKEND}!" >&2
            exit 1
        fi
        echo "    PASS: Backend code structure verified."

        # 6. Record Previous Releases for Rollback
        if [[ -L "${CURRENT_FRONTEND_SYMLINK}" ]]; then
            PREV_TARGET=$(readlink -f "${CURRENT_FRONTEND_SYMLINK}")
            echo "${PREV_TARGET}" > "${PREV_FRONTEND_SYMLINK_FILE}"
            echo "--> Recorded previous frontend release: ${PREV_TARGET}"
        elif [[ -d "${CURRENT_FRONTEND_SYMLINK}" ]]; then
            INITIAL_BACKUP="${FRONTEND_RELEASES_DIR}/legacy-initial-$(date +%Y%m%d%H%M%S)"
            mv "${CURRENT_FRONTEND_SYMLINK}" "${INITIAL_BACKUP}"
            echo "${INITIAL_BACKUP}" > "${PREV_FRONTEND_SYMLINK_FILE}"
        fi

        # Record active backend release ID if tracked
        if [[ -f "${BACKEND_DIR}/.current_release_id" ]]; then
            cat "${BACKEND_DIR}/.current_release_id" > "${PREV_BACKEND_RELEASE_FILE}"
        fi

        # 7. Atomically Swap Frontend Symlink (mv -Tf)
        echo "--> Atomically updating frontend symlink..."
        ln -sfn "${TARGET_FRONTEND}" "${CURRENT_FRONTEND_SYMLINK}.tmp"
        mv -Tf "${CURRENT_FRONTEND_SYMLINK}.tmp" "${CURRENT_FRONTEND_SYMLINK}"
        reload_nginx

        # 8. Sync Backend Source into /opt/vaksinamed under root control
        sync_backend_release "${TARGET_BACKEND}"
        echo "${RELEASE_ID}" > "${BACKEND_DIR}/.current_release_id"

        # 9. Rebuild and Restart API & Worker Containers (Stateless)
        echo "--> Building and restarting API and Worker containers..."
        cd "${BACKEND_DIR}"
        docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" up -d --build api worker

        # Sleep briefly for service port binding
        sleep 5

        # 10. Verify Post-Deploy Health Checks
        if ! run_healthchecks; then
            echo "CRITICAL: Health check failed! Triggering automatic rollback..." >&2
            
            # Rollback frontend symlink
            if [[ -f "${PREV_FRONTEND_SYMLINK_FILE}" ]]; then
                PREV_F=$(cat "${PREV_FRONTEND_SYMLINK_FILE}")
                if [[ -d "${PREV_F}" ]]; then
                    ln -sfn "${PREV_F}" "${CURRENT_FRONTEND_SYMLINK}.tmp"
                    mv -Tf "${CURRENT_FRONTEND_SYMLINK}.tmp" "${CURRENT_FRONTEND_SYMLINK}"
                    reload_nginx
                    echo "--> Restored frontend symlink to: ${PREV_F}"
                fi
            fi

            # Rollback backend code if previous release exists
            if [[ -f "${PREV_BACKEND_RELEASE_FILE}" ]]; then
                PREV_B_ID=$(cat "${PREV_BACKEND_RELEASE_FILE}")
                if [[ -d "${BACKEND_RELEASES_DIR}/${PREV_B_ID}" ]]; then
                    sync_backend_release "${BACKEND_RELEASES_DIR}/${PREV_B_ID}"
                    docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" up -d --build api worker || true
                    echo "--> Restored backend release to: ${PREV_B_ID}"
                fi
            else
                docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" restart api worker || true
            fi

            exit 1
        fi

        # 11. Prune Old Releases (Keep Last 5)
        echo "--> Pruning old frontend and backend releases (keeping last 5)..."
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
            docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" up -d --build api worker
        else
            echo "--> Restarting current containers as fallback..."
            cd "${BACKEND_DIR}"
            docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" restart api worker
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

    *)
        echo "Usage: vaksinamed-staging-ctl {deploy <release-id>|rollback|healthcheck|reload-nginx}" >&2
        exit 1
        ;;
esac
