#!/bin/bash
# deploy.sh — build, package and install magic4pc on LG TV
set -e

APP=me.wouterdek.magic4pc
IPK=me.wouterdek.magic4pc_1.1.0_all.ipk
TV=root@192.168.1.75
ARES_PACKAGE=/Users/admin/webOS_TV_SDK/CLI/bin/ares-package
LUNA=/Users/admin/Automations/tv-luna-send.sh

cd "$(dirname "$0")"

echo "==> Building..."
NODE_OPTIONS=--openssl-legacy-provider npm run build

echo "==> Packaging..."
$ARES_PACKAGE dist/ service/ --outdir .

echo "==> Copying to TV..."
scp "$IPK" "$TV:/tmp/magic4pc.ipk"

echo "==> Closing app..."
$LUNA -n 1 -f "luna://com.webos.service.applicationmanager/closeByAppId" "{\"id\":\"$APP\"}" || true

echo "==> Removing old version..."
$LUNA -n 1 -f "luna://com.webos.appInstallService/dev/remove" "{\"id\":\"$APP\"}" || true
sleep 2

echo "==> Installing (waiting for 'installed')..."
# luna-send -i (subscribe) cannot be used through the wrapper — use script directly
ssh "$TV" "script -q -c \"luna-send -i -f luna://com.webos.appInstallService/dev/install '{\\\"id\\\":\\\"$APP\\\",\\\"ipkUrl\\\":\\\"/tmp/magic4pc.ipk\\\",\\\"subscribe\\\":true}'\" /tmp/install.txt &
  for i in \$(seq 1 30); do
    sleep 1
    grep -q '\"state\":\"installed\"' /tmp/install.txt 2>/dev/null && break
  done
  kill %1 2>/dev/null; grep -v '^Script ' /tmp/install.txt; rm -f /tmp/install.txt"

echo "==> Launching..."
$LUNA -n 1 -f "luna://com.webos.applicationManager/launch" "{\"id\":\"$APP\"}"

echo "==> Done."
