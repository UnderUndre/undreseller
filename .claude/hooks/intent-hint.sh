#!/usr/bin/env bash
# UserPromptSubmit hook — injects routing hints when user prompt matches
# known intent keywords. Silent on no-match (avoids alarm fatigue).
#
# Schema (CC docs, 2026-05):
#   stdin  = JSON { session_id, cwd, hook_event_name, prompt }
#   stdout = JSON { hookSpecificOutput: { hookEventName, additionalContext } }
#   exit   = 0 (always allow; we only inject context, never block)
#
# Keywords mirror the "Intent Routing" table in CLAUDE.md. Update both
# when adding routes — there is no single source of truth (parsing
# markdown at runtime would be slow and fragile).
#
# Slash commands ("/dispatch foo") are skipped — user already routed.

set -euo pipefail

# Read full stdin into a variable (jq invoked once)
INPUT="$(cat)"

# Extract prompt (lowercase for case-insensitive match). If field missing
# or empty, exit silently — nothing to hint about.
PROMPT="$(echo "$INPUT" | jq -r '.prompt // ""' | tr '[:upper:]' '[:lower:]')"

if [ -z "$PROMPT" ]; then
  exit 0
fi

# Skip if user already invoked a slash command — that IS the dispatch.
case "$PROMPT" in
  /*) exit 0 ;;
esac

# Match against known intents. Order = priority (first match wins).
# Each match contributes ONE line to the hint accumulator.
HINTS=""

# ─── Repair flows ────────────────────────────────────────────────────
case "$PROMPT" in
  *"тесты упал"*|*"test fail"*|*"tests failing"*|*"failing test"*)
    HINTS="${HINTS}- Detected test-failure intent → consider \`/fix-tests\` (classifies + fixes).\n" ;;
esac
case "$PROMPT" in
  *"ci упал"*|*"ci fail"*|*"github actions"*|*"workflow run"*)
    HINTS="${HINTS}- Detected CI-failure intent → consider \`/fix-ci\` (parses log + classifies).\n" ;;
esac
case "$PROMPT" in
  *"тайп"*|*"ts error"*|*"typescript error"*|*"fix types"*)
    HINTS="${HINTS}- Detected TS-errors intent → consider \`/fix-types\` (cascade order).\n" ;;
esac
case "$PROMPT" in
  *"конфликт"*|*"merge conflict"*|*"rebase conflict"*)
    HINTS="${HINTS}- Detected merge-conflict intent → consider \`/resolve-conflicts\`.\n" ;;
esac

# ─── Investigation flows ────────────────────────────────────────────
case "$PROMPT" in
  *"не работает"*|*"сломалось"*|*"баг"*|*"bug"*|*"debug"*|*"not working"*|*"broken"*)
    HINTS="${HINTS}- Detected debug intent → spawn \`debugger\` agent + \`systematic-debugging\` skill.\n" ;;
esac
case "$PROMPT" in
  *"обкашлю"*|*"обкашляю"*|*"brainstorm"*|*"explore options"*|*"варианты"*)
    HINTS="${HINTS}- Detected brainstorm intent → consider \`/brainstorm\` (forward-looking, ≥3 options).\n" ;;
esac
case "$PROMPT" in
  *"найди дыр"*|*"scrutinize"*|*"devil's advocate"*|*"что может пойти не так"*|*"what could go wrong"*)
    HINTS="${HINTS}- Detected devil's-advocate intent → consider \`/questions_ideas\` (backward-looking).\n" ;;
esac

# ─── Status / inspection ────────────────────────────────────────────
case "$PROMPT" in
  *"проверь всё"*|*"verify"*|*"quality gate"*|*"дай статус"*)
    HINTS="${HINTS}- Detected verify intent → consider \`/verify\` (read-only quality matrix).\n" ;;
esac
case "$PROMPT" in
  *"что измен"*|*"what changed"*|*"git diff"*|*"дай diff"*)
    HINTS="${HINTS}- Detected diff intent → consider \`/diff\` (stat + 50-line preview).\n" ;;
esac
case "$PROMPT" in
  *"кто это написал"*|*"who wrote this"*|*"git blame"*)
    HINTS="${HINTS}- Detected blame intent → consider \`/blame-line\` (file:line → author + permalink).\n" ;;
esac
case "$PROMPT" in
  *"зависимост"*|*"deps"*|*"npm outdated"*|*"npm audit"*)
    HINTS="${HINTS}- Detected deps-health intent → consider \`/deps-check\` (no auto-upgrade).\n" ;;
esac
case "$PROMPT" in
  *"бенчмарк"*|*"benchmark"*|*"perf"*|*"performance"*)
    HINTS="${HINTS}- Detected perf intent → consider \`/perf-check\` (loads performance-profiling skill).\n" ;;
esac

# ─── Lifecycle ───────────────────────────────────────────────────────
case "$PROMPT" in
  *"релиз"*|*"release"*|*"ship "*|*"publish"*|*"bump version"*)
    HINTS="${HINTS}- Detected release intent → consider \`/bump\` (loads semver-versioning skill).\n" ;;
esac
case "$PROMPT" in
  *"запомни"*|*"capture lesson"*|*"session end"*|*"summari"*)
    HINTS="${HINTS}- Detected session-end intent → consider \`/improve\` (capture lessons → agent/skill files).\n" ;;
esac
case "$PROMPT" in
  *"regen"*|*"re-transpile"*|*"перегенери"*)
    HINTS="${HINTS}- Detected regen intent → consider \`/regen\` (upstream-only wrapper over \`helpers regen\`).\n" ;;
esac

# Silent if no matches.
if [ -z "$HINTS" ]; then
  exit 0
fi

# Compose injection. Header explains source so Claude knows to trust it.
CONTEXT="📍 Intent Routing hint (from \`.claude/hooks/intent-hint.sh\` matching CLAUDE.md table):\n${HINTS}If unsure → \`/dispatch <free-text>\` for explicit routing. The hint is advisory; Stop Conditions still apply."

# Emit JSON — additionalContext appears as a system note in Claude's stream.
jq -n --arg ctx "$CONTEXT" '{
  hookSpecificOutput: {
    hookEventName: "UserPromptSubmit",
    additionalContext: $ctx
  }
}'
