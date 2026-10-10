import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

describe('Staging Deployment Infrastructure Security Contracts', () => {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(__dirname, '../../..');
  const wrapperScript = path.join(repoRoot, 'infra/scripts/vaksinamed-staging-ctl.sh');
  const bootstrapScript = path.join(repoRoot, 'infra/scripts/bootstrap-staging-server.sh');
  const deployScript = path.join(repoRoot, 'infra/scripts/deploy-staging.sh');
  const rollbackScript = path.join(repoRoot, 'infra/scripts/rollback-staging.sh');
  const sudoersFile = path.join(repoRoot, 'infra/sudoers.d/vaksinamed-deployer');
  const workflowFile = path.join(repoRoot, '.github/workflows/staging-deploy.yml');

  it('1. Root wrapper script exists, has strict bash settings, and sanitizes environment', () => {
    assert.ok(fs.existsSync(wrapperScript), 'vaksinamed-staging-ctl.sh must exist');
    const content = fs.readFileSync(wrapperScript, 'utf8');

    assert.ok(content.includes('set -euo pipefail'), 'must enforce set -euo pipefail');
    assert.ok(content.includes('export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"'), 'must enforce secure PATH');
    assert.ok(content.includes('unset IFS'), 'must unset IFS');
    assert.ok(content.includes('unset BASH_ENV'), 'must unset BASH_ENV');

    const nonComment = content.split('\n').filter((l) => !l.trim().startsWith('#')).join('\n');
    assert.ok(!/\beval\s+/.test(nonComment), 'must not use eval command');
  });

  it('2. Root wrapper validates argument counts and rejects excess arguments', () => {
    const content = fs.readFileSync(wrapperScript, 'utf8');

    // Deploy requires exactly 2 arguments
    assert.ok(content.includes('$# -ne 2'), 'deploy action must require exactly 2 arguments');
    // Rollback, healthcheck, reload-nginx accept no additional arguments
    assert.ok(content.includes('$# -ne 1'), 'rollback, healthcheck, and reload-nginx must reject excess arguments');
    // Unknown action is rejected
    assert.ok(content.includes('Unknown action'), 'must reject unknown actions');
  });

  it('3. Root wrapper enforces strict release ID regex and rejects path traversal', () => {
    const content = fs.readFileSync(wrapperScript, 'utf8');

    assert.ok(content.includes('^[a-zA-Z0-9][a-zA-Z0-9._-]{6,63}$'), 'must enforce alphanumeric-starting regex on release ID');
    assert.ok(content.includes('*".."*'), 'must explicitly check and reject .. traversal');
  });

  it('4. Root wrapper implements TOCTOU protection by taking root ownership immediately', () => {
    const content = fs.readFileSync(wrapperScript, 'utf8');

    assert.ok(content.includes('chown -R root:root "${TARGET_FRONTEND}" "${TARGET_BACKEND}"'), 'must take root ownership before auditing');
    assert.ok(content.includes('find "${TARGET_FRONTEND}" "${TARGET_BACKEND}" -type l'), 'must audit and reject symlinks');
    assert.ok(content.includes('! -type f ! -type d'), 'must audit and reject special files');
  });

  it('5. Root wrapper audits and rejects smuggled configuration files (.env, compose, Dockerfile, shell scripts)', () => {
    const content = fs.readFileSync(wrapperScript, 'utf8');

    assert.ok(content.includes('-name ".env*"'), 'must reject .env files in release payload');
    assert.ok(content.includes('-name "docker-compose*"'), 'must reject docker-compose files in release payload');
    assert.ok(content.includes('-name "Dockerfile"'), 'must reject Dockerfile in release payload');
    assert.ok(content.includes('-name "*.sh"'), 'must reject shell scripts in release payload');
  });

  it('6. Root wrapper healthcheck validates binary font magic (not HTML 200)', () => {
    const content = fs.readFileSync(wrapperScript, 'utf8');

    assert.ok(content.includes('verify_font_file'), 'must implement font verification helper');
    assert.ok(content.includes('00010000') || content.includes('4f54544f'), 'must check binary font magic bytes');
    assert.ok(content.includes('run_healthchecks'), 'must execute healthchecks');
  });

  it('7. Sudoers file specifies strict command boundaries without wildcard abuse', () => {
    assert.ok(fs.existsSync(sudoersFile), 'sudoers file must exist');
    const content = fs.readFileSync(sudoersFile, 'utf8');

    assert.ok(content.includes('deployer ALL=(root) NOPASSWD:'), 'must grant restricted nopasswd to deployer');
    assert.ok(content.includes('/usr/local/bin/vaksinamed-staging-ctl deploy [a-zA-Z0-9]*'), 'must restrict deploy action');
    assert.ok(content.includes('/usr/local/bin/vaksinamed-staging-ctl rollback'), 'must restrict rollback');
    assert.ok(content.includes('/usr/local/bin/vaksinamed-staging-ctl healthcheck'), 'must restrict healthcheck');
    assert.ok(content.includes('/usr/local/bin/vaksinamed-staging-ctl reload-nginx'), 'must restrict reload-nginx');
    assert.ok(!content.includes('/bin/bash') && !content.includes('/bin/sh'), 'must never grant raw shell access');
  });

  it('8. Bootstrap script requires root and guards against production host', () => {
    assert.ok(fs.existsSync(bootstrapScript), 'bootstrap script must exist');
    const content = fs.readFileSync(bootstrapScript, 'utf8');

    assert.ok(content.includes('$(id -u)" -ne 0'), 'must enforce root check (UID 0)');
    assert.ok(content.includes('vaksina-gps') || content.includes('production'), 'must guard against production hostname');
    assert.ok(content.includes('gpasswd -d deployer docker'), 'must ensure deployer is not in docker group');
    assert.ok(content.includes('gpasswd -d deployer sudo'), 'must ensure deployer is not in sudo group');
    assert.ok(content.includes('.env.staging') && content.includes('600'), 'must enforce 0600 on .env.staging');
    assert.ok(content.includes('staging_pgdata') && content.includes('staging_redisdata'), 'must preserve database named volumes');
  });

  it('9. Staging deploy workflow enforces readiness gate (vars.STAGING_DEPLOY_READY) and SHA256 checksums', () => {
    assert.ok(fs.existsSync(workflowFile), 'workflow file must exist');
    const content = fs.readFileSync(workflowFile, 'utf8');

    assert.ok(content.includes('vars.STAGING_DEPLOY_READY == \'true\''), 'must gate live deploy with STAGING_DEPLOY_READY');
    assert.ok(content.includes('deployment-gate-notice'), 'must provide informational notice when deploy is gated');
    assert.ok(content.includes('sha256sum'), 'must generate release checksums in build job');
    assert.ok(content.includes('downloaded-feather.ttf'), 'must verify downloaded font binary header in healthcheck');
    assert.ok(content.includes('github.ref == \'refs/heads/main\''), 'must restrict live deploy to main branch only');
  });

  it('10. Nginx staging configuration protects font and asset paths from HTML fallback', () => {
    const nginxFile = path.join(repoRoot, 'infra/nginx/app-staging.conf');
    assert.ok(fs.existsSync(nginxFile), 'infra/nginx/app-staging.conf must exist');
    const content = fs.readFileSync(nginxFile, 'utf8');

    assert.ok(content.includes('location /fonts/'), 'must have dedicated /fonts/ location block');
    assert.ok(content.includes('location /assets/'), 'must have dedicated /assets/ location block');
    assert.ok(content.includes('location /_expo/'), 'must have dedicated /_expo/ location block');
    assert.ok(content.includes('try_files $uri =404;'), 'must return 404 for missing assets, never HTML fallback');
    assert.ok(content.includes('no-cache, no-store, must-revalidate'), 'must enforce no-cache on HTML routes');
    assert.ok(content.includes('font/ttf ttf'), 'must define explicit font MIME types');
  });
});
