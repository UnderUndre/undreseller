#!/usr/bin/env bash
# PreToolUse(Task) hook — prepends a "load skills from frontmatter"
# reminder to the spawned subagent's prompt. Solves the "subagent forgets
# its declared skills" problem: agents have skills: declared in
# .claude/agents/<name>.md frontmatter, but spawned sessions sometimes
# jump into work without loading them first.
#
# Mechanism: modifies `tool_input.prompt` via `updatedInput`. The reminder
# travels with the input INTO the subagent's context (not into parent's
# stream — that would be too late).
#
# Schema (CC docs, 2026-05):
#   stdin  = JSON { session_id, cwd, hook_event_name, tool_name, tool_input }
#   stdout = JSON { hookSpecificOutput: { hookEventName, permissionDecision: "allow",
#                   updatedInput: <modified tool_input> } }
#   exit   = 0 (always allow; failures degrade to passthrough, never block)
#
# Failure modes (silent no-op, agent spawns unmodified):
#   - tool_name != Task
#   - subagent_type missing or non-string
#   - .claude/agents/<name>.md missing
#   - frontmatter missing skills: line
#   - any parse error

set -euo pipefail

# Read full stdin
INPUT="$(cat)"

# Sanity check — only act on Task tool calls.
TOOL_NAME="$(echo "$INPUT" | jq -r '.tool_name // ""')"
if [ "$TOOL_NAME" != "Task" ]; then
  exit 0
fi

# Extract agent name and current prompt.
AGENT_NAME="$(echo "$INPUT" | jq -r '.tool_input.subagent_type // ""')"
ORIGINAL_PROMPT="$(echo "$INPUT" | jq -r '.tool_input.prompt // ""')"

# If no agent type → can't look up skills, passthrough.
if [ -z "$AGENT_NAME" ]; then
  exit 0
fi

# Locate agent file. CLAUDE_PROJECT_DIR points at the repo root.
AGENT_FILE="${CLAUDE_PROJECT_DIR:-.}/.claude/agents/${AGENT_NAME}.md"
if [ ! -f "$AGENT_FILE" ]; then
  # Could be a built-in/non-project agent (general-purpose, etc.) — passthrough.
  exit 0
fi

# Extract `skills:` line from frontmatter (first 30 lines, between --- markers).
# Handles: `skills: a, b, c` and `skills: [a, b, c]`. Multi-line YAML lists are
# not supported (no agent in this repo uses that form as of 2026-05).
SKILLS_RAW="$(awk '/^---$/{count++; next} count==1 && /^skills:/{sub(/^skills:[[:space:]]*/, ""); print; exit}' "$AGENT_FILE")"

# Strip surrounding [ ] if present, normalize whitespace.
SKILLS_LIST="$(echo "$SKILLS_RAW" | sed -E 's/^\[//; s/\]$//' | tr ',' '\n' | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//' | grep -v '^$' | paste -sd ',' -)"

if [ -z "$SKILLS_LIST" ]; then
  # No skills declared, nothing to remind about. Passthrough.
  exit 0
fi

# Build reminder. Goes at TOP of prompt so subagent reads it first.
REMINDER="[Pre-flight reminder from .claude/hooks/agent-skills-reminder.sh]
You are agent \`${AGENT_NAME}\`. Your frontmatter (\`.claude/agents/${AGENT_NAME}.md\`) declares these skills:
  ${SKILLS_LIST}
Use the Skill tool to load any that apply BEFORE doing substantive work. Skills exist for a reason — bypassing them is the failure mode this hook exists to prevent. The skills load instructions; you choose which apply to the task below.

──── Original task follows ────"

NEW_PROMPT="${REMINDER}

${ORIGINAL_PROMPT}"

# Output: allow + replace prompt in tool_input.
echo "$INPUT" | jq --arg new_prompt "$NEW_PROMPT" '{
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "allow",
    updatedInput: (.tool_input + { prompt: $new_prompt })
  }
}'
