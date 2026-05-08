#!/bin/sh
# magic4pc init.d script (runs as root)
APPS_FILE=/tmp/magic4pc-apps.json
TMP_OUT=/tmp/magic4pc-luna-raw.txt
RUN_STATE=/tmp/magic4pc-run-state

# On boot: remove run-state so service sees fresh start
rm -f "$RUN_STATE"
echo "[magic4pc init] boot - cleared run-state" >> /tmp/m4p_debug.log

update_apps() {
    script -q -c "luna-send -n 1 -f luna://com.webos.applicationManager/listApps '{}'" "$TMP_OUT" 2>/dev/null
    result=$(grep -v '^Script ' "$TMP_OUT" | tr -d '\r')
    if echo "$result" | grep -q '"returnValue": true'; then
        echo "$result" > "$APPS_FILE"
    fi
}

track_foreground() {
    while true; do
        script -q -c "luna-send -n 1 -f luna://com.webos.applicationManager/getForegroundAppInfo '{}'" /tmp/m4p_fg_raw.txt 2>/dev/null
        appId=$(grep -v '^Script' /tmp/m4p_fg_raw.txt | tr -d '\r' | grep '"appId"' | head -1 | sed 's/.*"appId": *"\([^"]*\)".*/\1/')
        if [ -n "$appId" ] && [ "$appId" != "me.wouterdek.magic4pc" ]; then
            echo "$appId" > /tmp/magic4pc-last-app
            cp /tmp/magic4pc-last-app /media/developer/apps/usr/palm/services/me.wouterdek.magic4pc.service/magic4pc-last-app 2>/dev/null
        fi
        sleep 3
    done
}

monitor_power() {
    prev_state=""
    while true; do
        script -q -c "luna-send -n 1 -f luna://com.webos.service.tvpower/power/getPowerState '{}'" /tmp/m4p_power_raw.txt 2>/dev/null
        state=$(grep -v '^Script' /tmp/m4p_power_raw.txt | tr -d '\r' | grep '"state"' | head -1 | sed 's/.*"state": *"\([^"]*\)".*/\1/')
        if [ -n "$state" ]; then
            prev_state="$state"
        fi
        sleep 2
    done
}

# Initial update
update_apps

# Start background workers
track_foreground &
monitor_power &

# Update apps every 5 minutes
while true; do sleep 300; update_apps; done &
