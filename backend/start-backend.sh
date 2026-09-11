#!/usr/bin/env bash
# Start the Coal-Intel API server in the background with logging.
# Restarts cleanly if an instance is already running.
#   Usage: backend/start-backend.sh
#   Logs:  /tmp/uvicorn.log   Health: curl localhost:8000/api/v1/health
set -euo pipefail
cd "$(dirname "$0")"
if ! [ -x .venv/bin/uvicorn ]; then
  echo "ERROR: backend/.venv not found — create the venv first (see RUN.md)" >&2
  exit 1
fi
pkill -f "uvicorn app.main:app" 2>/dev/null || true
sleep 1
nohup .venv/bin/uvicorn app.main:app --reload --port 8000 > /tmp/uvicorn.log 2>&1 &
disown
echo "Backend starting (PID $!) — log: /tmp/uvicorn.log"
sleep 3
if curl -sf -m 5 http://localhost:8000/api/v1/health > /dev/null; then
  echo "OK: backend is up on http://localhost:8000 (health: /api/v1/health)"
else
  echo "Still starting or failed — last log lines:" >&2
  tail -5 /tmp/uvicorn.log >&2 || true
  exit 1
fi
