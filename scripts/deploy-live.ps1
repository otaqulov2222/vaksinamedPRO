# Local one-shot: build customer web + ship to Eskiz VPS (same result as auto-timer).
# Usage:  pwsh scripts/deploy-live.ps1
$ErrorActionPreference = "Stop"
$key = Join-Path $env:USERPROFILE ".ssh\saydirasulov_vps"
$remote = "root@77.83.206.192"
$root = Split-Path $PSScriptRoot -Parent
if (-not (Test-Path (Join-Path $root "artifacts\soglom-apteka\package.json"))) {
  throw "Repo root not found from $PSScriptRoot"
}
$apteka = Join-Path $root "artifacts\soglom-apteka"
if (-not (Test-Path $key)) { throw "SSH key missing: $key" }

Write-Host "==> build web"
Push-Location $apteka
$env:EXPO_PUBLIC_API_URL = "https://77-83-206-192.sslip.io"
node scripts/export-web.mjs
Pop-Location

$tar = Join-Path $env:TEMP "soglom-web-live.tar.gz"
if (Test-Path $tar) { Remove-Item $tar -Force }
Push-Location (Join-Path $apteka "dist")
tar.exe -czf $tar *
Pop-Location

Write-Host "==> upload + remote deploy"
scp -o BatchMode=yes -i $key $tar "${remote}:/tmp/soglom-web-live.tar.gz"
scp -o BatchMode=yes -i $key (Join-Path $root "infra\scripts\deploy-live-vps.sh") "${remote}:/usr/local/bin/vaksinamed-live-deploy.sh"
ssh -o BatchMode=yes -i $key $remote @'
set -e
chmod +x /usr/local/bin/vaksinamed-live-deploy.sh
DIST=/var/www/vaksinamed/artifacts/soglom-apteka/dist
rm -rf "$DIST.new" && mkdir -p "$DIST.new"
tar -xzf /tmp/soglom-web-live.tar.gz -C "$DIST.new"
test -f "$DIST.new/index.html"
rm -rf "$DIST.bak"
mv "$DIST" "$DIST.bak"
mv "$DIST.new" "$DIST"
rm -rf "$DIST.bak"
# Also sync git so timer stays consistent
cd /var/www/vaksinamed
git fetch --prune origin main || true
git reset --hard origin/main || true
/usr/local/bin/vaksinamed-live-deploy.sh || true
ENTRY=$(grep -oE "entry-[a-f0-9]+\.js" "$DIST/index.html" | head -1)
echo "LIVE_ENTRY=$ENTRY"
'@

Write-Host "Done. Hard-refresh https://77-83-206-192.sslip.io/"
