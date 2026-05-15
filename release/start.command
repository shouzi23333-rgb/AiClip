#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if [ ! -f ".env.local" ]; then
  cp ".env.sample" ".env.local"
  echo "Created .env.local. Please fill in your API settings, then run start.command again."
  read -r -p "Press Enter to close..."
  exit 0
fi

if [ ! -x ".venv/bin/python" ]; then
  PYTHON_CMD="${PYTHON_CMD:-python3}"
  "$PYTHON_CMD" -m venv .venv
  ".venv/bin/python" -m pip install --upgrade pip
  ".venv/bin/python" -m pip install -r requirements.txt
fi

export PYTHON_BIN="$PWD/.venv/bin/python"
export HOSTNAME="${HOSTNAME:-127.0.0.1}"
export PORT="${PORT:-3000}"

echo "AiClip is starting at http://$HOSTNAME:$PORT"
node server.js
