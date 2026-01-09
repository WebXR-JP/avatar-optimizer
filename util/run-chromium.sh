#!/bin/bash
# CDP (Chrome DevTools Protocol) 付きで Chromium を起動するスクリプト
# Playwright MCP などから接続可能

CDP_PORT="${CDP_PORT:-9222}"
URL="${1:-http://localhost:5173}"

exec chromium \
  --no-sandbox \
  --remote-debugging-port="$CDP_PORT" \
  --no-first-run \
  --no-default-browser-check \
  --disable-background-networking \
  --disable-sync \
  --disable-translate \
  --metrics-recording-only \
  --enable-gpu \
  --enable-webgl \
  --ignore-gpu-blocklist \
  --enable-unsafe-swiftshader \
  --use-gl=desktop \
  --enable-gpu-rasterization \
  --ozone-platform=x11 \
  "$URL"
