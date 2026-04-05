# Natural Language Logging — Design Spec

_Date: 2026-04-05_

## Problem

Agent logs were raw technical output: `[Bash] cat /path/to/file`, `[Linear:list_issues] {"project":"..."}`. Readable only if you know what the agent is doing. No personality, no context, no narrative.

## Solution: Combo Approach

Two layers:

1. **Agent narration (Option B)** — agents call `log.sh` to emit first-person messages before major steps. These carry semantic intent and personality.
2. **Parser fallback (Option A)** — `claude-stream.js` formats un-narrated tool calls into readable one-liners as breadcrumbs.

## Components

### `scripts/log.sh`

Tiny helper script. Takes `<agent>` and `<message>`, writes a timestamped line with a `💬` sentinel to the agent's log file.

```
[2026-04-05 09:31:40] 💬 Reading memory. Picking up from last run.
```

The `💬` sentinel lets downstream consumers (dashboard, status.js) distinguish narration from tool breadcrumbs.

### `scripts/claude-stream.js` (updated)

- `log.sh` Bash calls are suppressed (null → not printed) — they write directly to the log, no double-logging
- Tool call fallbacks reformatted to short one-liners prefixed with `→`:
  - `[Bash] cat /Volumes/...` → `→ reading cto-memory.md`
  - `[Linear:list_issues]` → `→ Linear/list_issues (project: abc...)`
  - `[Agent] {"description":...}` → `→ spawning subagent: List CTO Directives...`
- `TodoWrite` and `ToolSearch` calls silently suppressed (internal plumbing)

### Agent prompts (all 5 updated)

Each agent has a `# Narration` section with:
- The `log.sh` invocation pattern for their agent name
- ~12 example messages in their voice
- Instruction to call before each numbered step

Voices:
- **Turing (CTO)**: terse, logical. "Checking for blockers — anything stalled over 48 hours."
- **Ada (PM)**: precise, purposeful. "Writing acceptance criteria for [issue title]."
- **Vera (Designer)**: visual-minded. "Reading my design memory — consistency matters more than novelty."
- **Linus (Programmer)**: blunt. "Running flutter analyze. Better be clean."
- **Grace (QA)**: methodical. "Deciding what actually needs testing here."

### `dashboard/index.html` (updated)

New CSS classes:
- `.log-narration` — bright, prominent (12.5px, weight 600, warm white `#e8e0d0`)
- `.log-tool` — de-emphasized breadcrumb (10px, dark `#4a4a52`)
- `.log-boundary` — italic, dark (run start markers)

`colorLogLine()` updated to route by line type:
1. Contains `💬` → narration styling
2. Starts with `→` → tool fallback styling
3. Contains `===` → boundary styling
4. Default → existing keyword colorization

### `dashboard/status.js` (updated)

`parseLastSummary()` now prefers the **last narration line** from the run (most recent thing the agent said) as the card summary. Falls back to first non-tool non-timestamp line (old behaviour) if no narration present.

## Log anatomy (after)

```
[2026-04-05 09:31:40] === CTO Agent starting ===
[2026-04-05 09:31:40] 💬 Checking for direct mentions.
→ reading cto.mention
[2026-04-05 09:31:41] 💬 Reading memory. Picking up from last run.
→ reading cto-memory.md
[2026-04-05 09:31:42] 💬 Looking for the CTO Directives project in Linear.
→ Linear/list_issues (project: 38efcf66...)
→ Linear/list_issues (project: d7b5fab6...)
[2026-04-05 09:31:45] 💬 Syncing completed items to the roadmap.
→ git pull origin main
→ editing cto-roadmap.md
→ git add docs/cto-roadmap.md && git commit ...
[2026-04-05 09:31:50] 💬 No blockers. No phase complete. Skipping report this run.
[2026-04-05 09:31:51] 💬 Updating memory and committing.
→ editing cto-memory.md
→ git add docs/memory/cto-memory.md && git commit ...
Run complete. [summary]
[2026-04-05 09:31:55] Done.
```

## Non-goals

- No structured JSON log format — plain text stays, `💬` is the only sentinel
- No changes to log file names or rotation
- No backfill of existing logs — old logs render fine with fallback styling
