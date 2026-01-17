#!/bin/bash
# Tide Commander - Permission Hook Script
# This script intercepts tool calls for interactive permission approval
#
# In interactive permission mode, this hook:
# 1. Receives PreToolUse events from Claude
# 2. Auto-approves safe read-only tools
# 3. Sends permission request to server for dangerous tools
# 4. Waits for user approval via the server
# 5. Returns approve/block decision to Claude

set -e

# Configuration
TIDE_SERVER="${TIDE_SERVER:-http://localhost:5174}"
TIDE_DATA_DIR="${HOME}/.tide-commander"
PERMISSION_TIMEOUT="${PERMISSION_TIMEOUT:-300}"  # 5 minute timeout
REMEMBERED_PATTERNS_FILE="${TIDE_DATA_DIR}/remembered-permissions.json"

# Ensure data directory exists
mkdir -p "${TIDE_DATA_DIR}"

# Initialize remembered patterns file if it doesn't exist
if [ ! -f "$REMEMBERED_PATTERNS_FILE" ]; then
  echo '[]' > "$REMEMBERED_PATTERNS_FILE"
fi

# Log function
log() {
  echo "[Permission Hook] $1" >> "${TIDE_DATA_DIR}/permission-hook.log"
}

# Read event from stdin
EVENT=$(cat)

# Parse event type (Claude uses hook_event_name, not event)
EVENT_TYPE=$(echo "$EVENT" | jq -r '.hook_event_name // "unknown"')

log "Received event type: $EVENT_TYPE"

# Only handle PreToolUse events
if [ "$EVENT_TYPE" != "PreToolUse" ]; then
  # Pass through - don't interfere with other events
  exit 0
fi

# Extract event details
TOOL_NAME=$(echo "$EVENT" | jq -r '.tool_name // "unknown"')
TOOL_INPUT=$(echo "$EVENT" | jq -c '.tool_input // {}')
TOOL_USE_ID=$(echo "$EVENT" | jq -r '.tool_use_id // ""')
SESSION_ID=$(echo "$EVENT" | jq -r '.session_id // ""')

log "Tool: $TOOL_NAME, ToolUseId: $TOOL_USE_ID, Session: $SESSION_ID"

# ============================================================================
# Safe tools that don't need permission (read-only operations)
# ============================================================================
SAFE_TOOLS="Read Glob Grep Task TaskOutput WebFetch WebSearch TodoWrite AskUserQuestion EnterPlanMode ExitPlanMode Skill"

# Check if tool is in the safe list
is_safe_tool() {
  local tool="$1"
  for safe in $SAFE_TOOLS; do
    if [ "$tool" = "$safe" ]; then
      return 0
    fi
  done
  return 1
}

# Auto-approve safe tools
if is_safe_tool "$TOOL_NAME"; then
  log "Auto-approving safe tool: $TOOL_NAME"
  jq -n '{"decision": "approve"}'
  exit 0
fi

# ============================================================================
# Check remembered patterns
# ============================================================================
check_remembered_pattern() {
  local tool="$1"
  local input="$2"

  # Read remembered patterns
  if [ -f "$REMEMBERED_PATTERNS_FILE" ]; then
    local patterns=$(cat "$REMEMBERED_PATTERNS_FILE")

    # Check each pattern
    local count=$(echo "$patterns" | jq 'length')
    for i in $(seq 0 $((count - 1))); do
      local p_tool=$(echo "$patterns" | jq -r ".[$i].tool")
      local p_pattern=$(echo "$patterns" | jq -r ".[$i].pattern")

      if [ "$p_tool" = "$tool" ]; then
        # For file operations, check if path matches pattern
        if [ "$tool" = "Write" ] || [ "$tool" = "Edit" ]; then
          local file_path=$(echo "$input" | jq -r '.file_path // ""')
          if [[ "$file_path" == $p_pattern* ]]; then
            log "Remembered pattern match: $p_pattern for $file_path"
            return 0
          fi
        # For Bash, check if command starts with pattern
        elif [ "$tool" = "Bash" ]; then
          local cmd=$(echo "$input" | jq -r '.command // ""')
          if [[ "$cmd" == $p_pattern* ]]; then
            log "Remembered pattern match: $p_pattern for command"
            return 0
          fi
        fi
      fi
    done
  fi
  return 1
}

# Check if this matches a remembered pattern
if check_remembered_pattern "$TOOL_NAME" "$TOOL_INPUT"; then
  log "Auto-approving via remembered pattern"
  jq -n '{"decision": "approve"}'
  exit 0
fi

# Generate unique request ID
REQUEST_ID=$(cat /proc/sys/kernel/random/uuid 2>/dev/null || uuidgen 2>/dev/null || echo "$$-$(date +%s%N)")

# Create permission request
PERMISSION_REQUEST=$(jq -n \
  --arg id "$REQUEST_ID" \
  --arg sessionId "$SESSION_ID" \
  --arg tool "$TOOL_NAME" \
  --argjson toolInput "$TOOL_INPUT" \
  --arg toolUseId "$TOOL_USE_ID" \
  --argjson timestamp "$(date +%s%3N)" \
  '{
    id: $id,
    sessionId: $sessionId,
    tool: $tool,
    toolInput: $toolInput,
    toolUseId: $toolUseId,
    timestamp: $timestamp,
    status: "pending"
  }')

log "Sending permission request: $REQUEST_ID"

# Send permission request to server and get response
# The server will hold this request until the user approves/denies
RESPONSE=$(curl -s -X POST \
  -H "Content-Type: application/json" \
  -d "$PERMISSION_REQUEST" \
  --max-time "$PERMISSION_TIMEOUT" \
  "${TIDE_SERVER}/api/permission-request" 2>&1)

CURL_EXIT=$?

log "Server response (exit=$CURL_EXIT): $RESPONSE"

# Check if curl succeeded
if [ $CURL_EXIT -ne 0 ]; then
  log "Error: Failed to contact server (exit code: $CURL_EXIT)"
  # On error, block the action for safety
  jq -n --arg reason "Failed to contact permission server" '{"decision": "block", "reason": $reason}'
  exit 0
fi

# Parse the response
DECISION=$(echo "$RESPONSE" | jq -r '.decision // "block"')
REASON=$(echo "$RESPONSE" | jq -r '.reason // ""')

log "Decision: $DECISION, Reason: $REASON"

# Return decision to Claude
if [ "$DECISION" = "approve" ]; then
  jq -n '{"decision": "approve"}'
else
  if [ -n "$REASON" ]; then
    jq -n --arg reason "$REASON" '{"decision": "block", "reason": $reason}'
  else
    jq -n '{"decision": "block", "reason": "User denied permission"}'
  fi
fi

exit 0
