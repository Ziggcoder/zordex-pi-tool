#!/bin/sh

export DISPLAY=:0

ENV_FILE="$HOME/.pitoolenv"
[ -f "$ENV_FILE" ] && . "$ENV_FILE"

LOG="$HOME/pitoolstart.log"
REPO_DIR="${REPO_DIR:-$HOME/zigg}"
DISPLAY_OUTPUT="${DISPLAY_OUTPUT:-SPI-1}"
APP_URL="${APP_URL:-http://localhost:3000}"

{
  echo "[pitoolstart] $(date) start"

  xset -dpms
  xset s off
  xset s noblank

  # rotate display properly (only if output exists)
  if xrandr | grep -q "^${DISPLAY_OUTPUT} "; then
    xrandr --output "$DISPLAY_OUTPUT" --rotate normal --gamma 1:1:1
  else
    echo "[pitoolstart] display output ${DISPLAY_OUTPUT} not found, skipping xrandr"
  fi

  # touch fix (180° rotation case)
  if command -v xinput >/dev/null 2>&1; then
    if xinput list | grep -q "ADS7846 Touchscreen"; then
      xinput set-prop "ADS7846 Touchscreen" "Coordinate Transformation Matrix" -1 0 1 0 -1 1 0 0 1
    fi
  fi

  openbox-session &

  # start PM2 services if available
  if command -v pm2 >/dev/null 2>&1; then
    pm2 resurrect || pm2 start "$REPO_DIR/ecosystem.config.js"
  else
    echo "[pitoolstart] pm2 not found" 
  fi

  # wait for localhost:3000
  echo "[pitoolstart] waiting for ${APP_URL}"
  READY=0
  i=0
  while [ $i -lt 30 ]; do
    if command -v curl >/dev/null 2>&1; then
      if curl -fsS "$APP_URL" >/dev/null 2>&1; then
        READY=1
        break
      fi
    elif command -v wget >/dev/null 2>&1; then
      if wget -q --spider "$APP_URL" >/dev/null 2>&1; then
        READY=1
        break
      fi
    else
      sleep 1
      i=$((i + 1))
      continue
    fi
    sleep 1
    i=$((i + 1))
  done

  if [ $READY -eq 1 ]; then
    echo "[pitoolstart] app is ready"
  else
    echo "[pitoolstart] timeout waiting for app"
  fi

  # find chromium binary
  if command -v chromium-browser >/dev/null 2>&1; then
    CHROME_CMD="chromium-browser"
  elif command -v chromium >/dev/null 2>&1; then
    CHROME_CMD="chromium"
  else
    CHROME_CMD=""
  fi

  if [ -z "$CHROME_CMD" ]; then
    echo "[pitoolstart] chromium not found"
    exit 1
  fi

  "$CHROME_CMD" \
    --kiosk \
    --app="$APP_URL" \
    --window-size=480,320 \
    --window-position=0,0 \
    --noerrdialogs \
    --disable-infobars \
    --disable-session-crashed-bubble \
    --disable-restore-session-state \
    --disable-pinch \
    --overscroll-history-navigation=0 \
    --disable-features=TranslateUI \
    --incognito

} >> "$LOG" 2>&1
