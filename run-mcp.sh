#!/usr/bin/env bash
# run-mcp.sh — wrapper for gel-mcp-server
# Place this at /Users/andreamaspero/Projects/personal/gel-mcp-server/run-mcp.sh
# Make executable: chmod +x run-mcp.sh

# ------- Configuration -------
# Adjust these if needed
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="$SCRIPT_DIR/mcp-server.log"
NODE_PATH="$SCRIPT_DIR/node_modules"
EXEC_CMD=("node" "$SCRIPT_DIR/build/index.js")

# ------- Logging Setup -------
echo "[$(date +'%F %T')] Starting gel-mcp-server..." | tee -a "$LOG_FILE"

# ------- Signal Handlers -------
shutdown() {
  echo "[$(date +'%F %T')] Shutdown signal received, stopping server..." | tee -a "$LOG_FILE"
  # If your server listens for SIGTERM, simply exit; otherwise kill child
  if [[ -n "$CHILD_PID" ]]; then
    kill -SIGTERM "$CHILD_PID"
    wait "$CHILD_PID"
  fi
  echo "[$(date +'%F %T')] Server stopped." | tee -a "$LOG_FILE"
  exit 0
}

trap shutdown SIGINT SIGTERM

# ------- Run Server -------
export NODE_PATH
cd "$SCRIPT_DIR"
"${EXEC_CMD[@]}" &
CHILD_PID=$!

# Wait for child to exit or signals
wait "$CHILD_PID"
EXIT_CODE=$?

echo "[$(date +'%F %T')] gel-mcp-server exited with code $EXIT_CODE" | tee -a "$LOG_FILE"
exit "$EXIT_CODE"
