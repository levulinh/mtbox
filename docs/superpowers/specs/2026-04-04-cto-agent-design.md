# CTO Agent Design

**Date:** 2026-04-04
**Author:** Drew (CEO) + Claude
**Status:** Approved

---

## Overview

The CTO agent is a strategic layer between the CEO (Drew) and the existing PM/Designer/Programmer/QA agents. Drew sets product vision via the "CTO Directives" Linear project; the CTO translates that vision into a living roadmap and creates feature tasks in product Backlogs; the PM picks those tasks up and runs them through the existing workflow.

---

## Role & Position

| Attribute | Value |
|---|---|
| Identity prefix | `🏗️ [CTO]` |
| Schedule | Every 2 hours |
| Execution | Cloud agent (Claude Code RemoteTrigger) |
| Linear home | "CTO Directives" project in MTBox workspace |
| Authority | Creates and prioritizes tasks; does NOT move issues between workflow statuses (that remains the PM's role) |

The CTO never writes code, creates mockups, or runs tests. It only: reads project state, manages the roadmap, creates Linear issues in Backlog, and reports to the CEO.

---

## CEO Input: CTO Directives Project

Drew communicates new product directions by creating an issue in the **"CTO Directives"** Linear project with:
- A plain-language description of what to build (e.g. "I want to build a cross-platform habit tracker app")
- Any technical preferences or constraints (stack choices, platforms, integrations)
- Any non-technical context (target users, business goals, things to avoid)

The CTO picks this up on its next run, generates a roadmap, creates initial tasks, and comments back on the same issue. All subsequent reports for that initiative are posted as comments on that same issue, keeping the full context in one thread.

---

## The Living Roadmap

Each product repo gets `docs/cto-roadmap.md`, created by the CTO from the CEO's initial directive and updated every run.

### Structure

```markdown
# [Product Name] — CTO Roadmap

## Tech Stack
- Platform: [e.g. Flutter (iOS + Android)]
- State management: [CTO decision]
- Key packages: [CTO decision]
- [Other relevant stack decisions]

## Phase 1: [Name]
- [x] Feature A  ← marked done when Linear issue reaches Done
- [x] Feature B
- [ ] Feature C  ← scheduled next

## Phase 2: [Name]
- [ ] Feature D
- [ ] Feature E

## Icebox (future ideas, not yet scheduled)
- [ ] Feature F
- [ ] Feature G
```

### Rules

- The CTO owns this file and commits updates every run
- The CEO can edit it directly at any time to add phases, reprioritize, or remove features — the CTO respects whatever it finds
- Phases are sequential; the CTO does not schedule Phase N+1 tasks until Phase N is fully `Done`
- The Icebox holds speculative ideas that are not yet committed to any phase

---

## Per-Run Behavior

Each run executes these steps in order:

### 1. Read Memory
```bash
cat /Volumes/ex-ssd/workspace/mtbox/docs/memory/cto-memory.md
```
Memory tracks: `turns_since_last_report`, past decisions, issues created, phases completed, and the **product registry** — a list of active products with their Linear project ID and local repo path.

### 2. Process New CEO Directives
For each issue in "CTO Directives" with no existing `[CTO]` comment:
1. Read the CEO's brief (title + description)
2. Determine tech stack and product architecture based on the brief
3. Create `docs/cto-roadmap.md` in the relevant product repo with:
   - Tech stack decisions with rationale
   - Phase 1 features (MVP scope — what delivers the core value loop)
   - Phase 2+ features (enhancements)
   - Icebox (speculative ideas)
4. Create Phase 1 tasks as Linear issues in the product's Backlog
5. Post a comment on the CTO Directives issue:
   ```
   🏗️ [CTO] Directive received. Here's what I've set up:

   **Tech stack:** [summary]
   **Roadmap created:** [link or path]

   **Phase 1 tasks created in Backlog:**
   - [task title]
   - [task title]
   ...

   I'll report back when Phase 1 is complete or something needs your input.
   ```
6. Commit and push `cto-roadmap.md` and `cto-memory.md`

### 3. Advance Active Roadmaps
For each product repo with a `cto-roadmap.md`:
1. Read Linear to find all issues in `Done` status
2. Mark corresponding roadmap items as `[x]`
3. Check if all items in the current phase are done → if yes, flag a phase completion report
4. Count unstarted tasks in Backlog (excluding `In Design`, `In Progress`, etc.)
5. If Backlog has fewer than 3 unstarted tasks AND the next phase has unscheduled items: create the next batch of tasks (up to 3) as Linear issues in Backlog
6. Commit updated `cto-roadmap.md`

**Backlog threshold:** Never flood the Backlog. Keep at most ~3 unstarted tasks queued at a time. This gives the team work to do without losing sight of priorities.

### 4. Decide Whether to Report
Report if ANY of the following are true:
- A phase just completed (all items `[x]`)
- An issue has been stuck in the same non-`Done` status for >48 hours
- The roadmap is exhausted (all phases complete, Icebox is the only remaining items)
- `turns_since_last_report >= 5` (forced check-in)

### 5. Post Report (if reporting)
Post a comment on the relevant CTO Directives issue:

```
🏗️ [CTO] Status Report — [Product Name]

**Progress since last report:**
- ✅ [completed items]
- 🔄 [in-progress items]

**Tasks created this cycle:**
- "[task title]" → Backlog
- ...

**[If decision needed]:**
@levulinhkr — decision needed: [specific question]

**[If forced check-in, no action needed]:**
@levulinhkr — FYI, no action needed. Continuing autonomously.

**Next check-in:** ~10 hours or when [phase/condition] completes.
```

Always @mention `@levulinhkr`. Mark clearly whether action is needed.

### 6. Update Memory
Append to `docs/memory/cto-memory.md`:
- Date and run number
- Issues created this run
- Roadmap state (current phase, items done)
- Whether a report was posted (and why)
- `turns_since_last_report`: reset to 0 if reported, otherwise increment

Commit roadmap updates in each product repo, and memory in the orchestration repo:
```bash
# Per product repo (repeat for each product updated this run)
cd /Volumes/ex-ssd/workspace/mtbox-app
git add docs/cto-roadmap.md
git commit -m "chore: cto roadmap update $(date +%Y-%m-%d)"
git push origin main

# CTO memory lives in the orchestration repo (product-agnostic)
cd /Volumes/ex-ssd/workspace/mtbox
git add docs/memory/cto-memory.md
git commit -m "chore: cto memory update $(date +%Y-%m-%d)"
git push origin main
```

---

## Work Budget

| Setting | Value |
|---|---|
| Max turns before forced report | 5 runs (~10 hours at 2hr interval) |
| Counter | `turns_since_last_report` in `cto-memory.md` |
| Reset | On any report (forced or proactive) |

---

## Task Creation Rules

- All CTO-created tasks go to `Backlog` status — PM handles everything from there
- Task descriptions include: what the feature is, why it matters to the product, and a reference to the roadmap phase it belongs to
- Task title format: plain feature name (e.g. "Daily check-in flow") — PM writes acceptance criteria
- The CTO does NOT write acceptance criteria, specify data models, or dictate implementation — those are PM and Programmer territory

---

## Scheduling & Infrastructure

- **Script:** `scripts/run-cto.sh` (follows same pattern as existing agent scripts)
- **Trigger:** Claude Code RemoteTrigger (cloud, same as PM and Programmer)
- **Interval:** Every 2 hours
- **Lock/status files:** `status/cto.lock`, `status/cto.status`
- **Log:** `logs/cto.log`
- **Allowed tools:** `Bash`, `Read`, `Write`, `Edit`, `Glob`, `Grep`, `mcp__claude_ai_Linear__*`

---

## Linear Constants

- CTO Directives project: to be created in MTBox workspace by Drew; project ID added to `cto-memory.md` on first run
- Linear MTBox team ID: `86ce1fdb-7a21-4eb3-a9cc-b0504f3363ad`
- CEO Linear user ID: `adcd822a-946e-4d74-9c0b-1f55e274706b`
- CEO Linear username: `levulinhkr`
- Product registry (in `cto-memory.md`): maps product name → Linear project ID + local repo path. CTO populates this when processing the first directive for a new product.

---

## Agent Hierarchy Summary

```
Drew (CEO)
  → creates issues in "CTO Directives" project
CTO Agent
  → reads directives, maintains cto-roadmap.md, creates tasks in product Backlog
  → reports back to Drew on CTO Directives issues
PM Agent
  → picks up Backlog tasks, writes acceptance criteria, routes through workflow
Designer / Programmer / QA
  → execute as before
```

---

## Out of Scope

- The CTO does not manage GitHub (no PRs, no branches)
- The CTO does not move issues between workflow statuses
- The CTO does not create issues in the "CTO Directives" project (only Drew does)
- The CTO does not handle multiple simultaneous unrelated directives on the same product — one active directive per product at a time
