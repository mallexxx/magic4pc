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
        if [ -n "$appId" ]; then
            # Track ALL foreground apps including magic4pc for suspend detection
            echo "$appId" > /tmp/magic4pc-foreground
            # Only save non-EIM apps as last-app (and not magic4pc itself)
            case "$appId" in
                com.webos.app.hdmi[0-9]|com.webos.app.externalinput.*|com.webos.app.livetv|me.wouterdek.magic4pc)
                    # EIM source is active — mark as already running so magic4pc won't auto-launch
                    if [ "$appId" != "me.wouterdek.magic4pc" ] && [ ! -f "$RUN_STATE" ]; then
                        echo "running" > "$RUN_STATE"
                        echo "[magic4pc init] EIM foreground=$appId, set run-state" >> /tmp/m4p_debug.log
                    fi
                    ;;
                *)
                    echo "$appId" > /tmp/magic4pc-last-app
                    cp /tmp/magic4pc-last-app /media/developer/apps/usr/palm/services/me.wouterdek.magic4pc.service/magic4pc-last-app 2>/dev/null
                    ;;
            esac
        fi
        sleep 3
    done
}

monitor_power() {
    prev_state=""
    while true; do
        script -q -c "luna-send -n 1 -f luna://com.webos.service.tvpower/power/getPowerState '{}'" /tmp/m4p_power_raw.txt 2>/dev/null
        state=$(grep -v '^Script' /tmp/m4p_power_raw.txt | tr -d '\r' | grep '"state"' | head -1 | sed 's/.*"state": *"\([^"]*\)".*/\1/')
        if [ "$state" = "Suspend" ] && [ "$prev_state" != "Suspend" ]; then
            foreground=$(cat /tmp/magic4pc-foreground 2>/dev/null)
            # EIM sources + magic4pc itself: keep run-state on suspend
            case "$foreground" in
                com.webos.app.hdmi[0-9]|com.webos.app.externalinput.*|com.webos.app.livetv|me.wouterdek.magic4pc)
                    echo "[magic4pc init] suspend: foreground=$foreground is EIM source, keeping run-state" >> /tmp/m4p_debug.log
                    ;;
                *)
                    echo "[magic4pc init] suspend: foreground=$foreground, clearing run-state for wake" >> /tmp/m4p_debug.log
                    rm -f "$RUN_STATE"
                    ;;
            esac
        fi
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
