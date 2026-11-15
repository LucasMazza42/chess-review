#!/usr/bin/env sh
# Optional: serve the app locally (opening index.html directly also works in Chrome/Edge/Firefox).
cd "$(dirname "$0")"
PORT="${1:-8000}"
echo "Game Review running at http://localhost:$PORT  (Ctrl+C to stop)"
( sleep 1; (open "http://localhost:$PORT" || xdg-open "http://localhost:$PORT") >/dev/null 2>&1 ) &
python3 -m http.server "$PORT"
