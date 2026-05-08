#!/bin/bash
TV=root@192.168.1.75
KP_ID="vkvideo"
M4P_ID="me.wouterdek.magic4pc"
HDMI_ID="com.webos.app.hdmi1"
OTHER_APP="org.jellyfin.webos"  # non-EIM, non-magic4pc, becomes foreground

PASS=0
FAIL=0

tv_cmd() {
    ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=no $TV "$1" 2>/dev/null
}

launch_app() {
    tv_cmd "script -q -c \"luna-send -n 1 luna://com.webos.applicationManager/launch '{\\\"id\\\":\\\"$1\\\"}'\" /tmp/ll.txt" > /dev/null
}

close_app() {
    tv_cmd "script -q -c \"luna-send -n 1 luna://com.webos.applicationManager/close '{\\\"id\\\":\\\"$1\\\"}'\" /tmp/cl.txt" > /dev/null
}

get_foreground() {
    tv_cmd "script -q -c \"luna-send -n 1 -f luna://com.webos.applicationManager/getForegroundAppInfo '{}'\" /tmp/fg.txt 2>/dev/null; grep -v '^Script' /tmp/fg.txt | tr -d '\\r' | grep '\"appId\"' | head -1 | sed 's/.*\"appId\": *\"\\([^\"]*\\)\".*/\\1/'"
}

do_reboot() {
    ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no $TV "reboot; exit 0" 2>/dev/null || true
}

wait_for_tv() {
    echo "  Waiting for TV to reboot..."
    sleep 20
    for i in $(seq 1 40); do
        if tv_cmd "echo ok" 2>/dev/null | grep -q ok; then
            echo "  TV is up. Waiting for init.d (~10s)..."
            sleep 10
            return 0
        fi
        sleep 3
    done
    echo "  TIMEOUT waiting for TV"
    return 1
}

# Expect NO KP: launch magic4pc, verify it stays as foreground (no switch to KP)
check_no_kp() {
    local name="$1"
    echo "  Launching magic4pc manually..."
    launch_app "$M4P_ID"
    sleep 8
    local fg=$(get_foreground)
    local run_state=$(tv_cmd "cat /tmp/magic4pc-run-state 2>/dev/null || echo '(none)'")
    echo "  run-state: $run_state"
    echo "  foreground: $fg"
    echo "  init.d EIM log: $(tv_cmd 'grep EIM /tmp/m4p_debug.log 2>/dev/null | tail -2')"
    if [ "$fg" = "$KP_ID" ]; then
        echo "  ❌ FAIL [$name]: KP launched but should NOT have"
        FAIL=$((FAIL+1))
    else
        echo "  ✅ PASS [$name]: KP did NOT launch"
        PASS=$((PASS+1))
    fi
    close_app "$M4P_ID"; close_app "$KP_ID"; sleep 2
}

# Expect KP auto-launch: check foreground right after boot
check_kp_autolaunch() {
    local name="$1"
    sleep 5  # give magic4pc time to auto-launch KP
    local fg=$(get_foreground)
    local run_state=$(tv_cmd "cat /tmp/magic4pc-run-state 2>/dev/null || echo '(none)'")
    echo "  run-state: $run_state"
    echo "  foreground: $fg"
    echo "  svc autolaunch log: $(tv_cmd 'grep -i autolaunch /tmp/m4p_debug.log 2>/dev/null | tail -2')"
    if [ "$fg" = "$KP_ID" ]; then
        echo "  ✅ PASS [$name]: KP auto-launched"
        PASS=$((PASS+1))
    else
        echo "  ❌ FAIL [$name]: expected KP ($KP_ID), got: $fg"
        FAIL=$((FAIL+1))
    fi
    close_app "$KP_ID"; sleep 2
}

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║       magic4pc auto-launch test suite    ║"
echo "╚══════════════════════════════════════════╝"

# TEST 1: HDMI → reboot → magic4pc → NO KP
echo ""
echo "─── TEST 1: HDMI → reboot → manual magic4pc (expect: NO KP) ───"
launch_app "$HDMI_ID"; sleep 4
echo "  Foreground before reboot: $(get_foreground)"
do_reboot; wait_for_tv || exit 1
echo "  Foreground after boot: $(get_foreground)"
check_no_kp "TEST 1"

# TEST 2: HDMI → other app → reboot → magic4pc → NO KP
echo ""
echo "─── TEST 2: HDMI → Jellyfin → reboot → manual magic4pc (expect: NO KP) ───"
launch_app "$HDMI_ID"; sleep 3
launch_app "$OTHER_APP"; sleep 4
echo "  Foreground before reboot: $(get_foreground)"
do_reboot; wait_for_tv || exit 1
echo "  Foreground after boot: $(get_foreground)"
check_no_kp "TEST 2"

# TEST 3: magic4pc → reboot → KP SHOULD auto-launch
echo ""
echo "─── TEST 3: magic4pc → reboot (expect: KP auto-launches) ───"
launch_app "$M4P_ID"; sleep 4
echo "  Foreground before reboot: $(get_foreground)"
do_reboot; wait_for_tv || exit 1
check_kp_autolaunch "TEST 3"

# TEST 4: magic4pc → other app → reboot → KP SHOULD auto-launch
echo ""
echo "─── TEST 4: magic4pc → Jellyfin → reboot (expect: KP auto-launches) ───"
launch_app "$M4P_ID"; sleep 3
launch_app "$OTHER_APP"; sleep 4
echo "  Foreground before reboot: $(get_foreground)"
do_reboot; wait_for_tv || exit 1
check_kp_autolaunch "TEST 4"

echo ""
echo "╔══════════════════════════════════════════╗"
printf "║  Results: %d passed, %d failed              ║\n" $PASS $FAIL
echo "╚══════════════════════════════════════════╝"

[ $FAIL -eq 0 ] && exit 0 || exit 1
