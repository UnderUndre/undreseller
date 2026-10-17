#!/usr/bin/env bash
# Stop hook — fires a session-checkpoint reminder ONCE per session, at
# turn N (default 30). Reminds about /improve, /learn, specs/main update.
#
# Why turn-counted, not per-Stop: CC's Stop hook fires after EVERY
# assistant response, not at "session end" (CC has no such event).
# Naive every-Stop reminder = alarm fatigue. Counter-based gate fires
# once at a threshold where lessons have likely accumulated but context
# hasn't been compacted away yet.
#
# State: per-session files in $TMPDIR (auto-cleaned by OS, never
# committed). Two files per session_id:
#   - <prefix>-counter-<id>  : monotonic turn count
#   - <prefix>-fired-<id>    : marker that reminder already fired
#
# Schema (CC docs, 2026-05):
#   stdin  = JSON { session_id, cwd, hook_event_name, stop_hook_active }
#   stdout = JSON { hookSpecificOutput: { hookEventName, additionalContext } }
#   exit   = 0 (always; never blocks Claude from stopping)

set -euo pipefail

THRESHOLD=30  # turns before checkpoint fires
PREFIX="${TMPDIR:-/tmp}/clai-helpers-stop"

INPUT="$(cat)"

# Loop guard — if Claude is already responding to a Stop-block, don't
# fire again (would create infinite resume cycle).
STOP_ACTIVE="$(echo "$INPUT" | jq -r '.stop_hook_active // false')"
if [ "$STOP_ACTIVE" = "true" ]; then
  exit 0
fi

SESSION_ID="$(echo "$INPUT" | jq -r '.session_id // ""')"
if [ -z "$SESSION_ID" ]; then
  exit 0  # No session id → can't track state, passthrough.
fi

# Sanitize for filename safety (session ids look like uuids but be defensive).
SAFE_ID="$(echo "$SESSION_ID" | tr -c 'a-zA-Z0-9-' '_')"
COUNTER_FILE="${PREFIX}-counter-${SAFE_ID}"
FIRED_FILE="${PREFIX}-fired-${SAFE_ID}"

# Increment counter (init at 1 if missing).
if [ -f "$COUNTER_FILE" ]; then
  COUNT="$(cat "$COUNTER_FILE")"
  COUNT=$((COUNT + 1))
else
  COUNT=1
fi
echo "$COUNT" > "$COUNTER_FILE"

# Already fired this session? Done.
if [ -f "$FIRED_FILE" ]; then
  exit 0
fi

# Below threshold? Wait.
if [ "$COUNT" -lt "$THRESHOLD" ]; then
  exit 0
fi

# Touch fired marker FIRST (so any error below still suppresses next-turn re-fire).
touch "$FIRED_FILE"

# Build reminder. Conditionally mention /learn only if the command exists
# (gracefully handles ordering where this hook lands before Step 6's /learn).
LEARN_LINE=""
if [ -f "${CLAUDE_PROJECT_DIR:-.}/.claude/commands/learn.md" ]; then
  LEARN_LINE="
- \`/learn <pattern-name>\` — promote a reusable pattern into knowledge/patterns/"
fi

REMINDER="📍 Session checkpoint (turn ${COUNT}, fires once per session).

Worth a quick mental pass before continuing or wrapping:
- \`/improve\` — capture lessons learned this session into agent/skill files${LEARN_LINE}
- \`specs/main/architecture.md\` or \`requirements.md\` — update if architecture/contracts changed
- Pending TodoWrite items — clear or document if dropping
- Uncommitted state — \`/diff\` to glance, \`/verify\` to gate

Advisory only. This hint is one-shot per session; subsequent turns will not repeat."

jq -n --arg ctx "$REMINDER" '{
  hookSpecificOutput: {
    hookEventName: "Stop",
    additionalContext: $ctx
  }
}'
