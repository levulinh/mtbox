# MTBox AI Company Design

**Date:** 2026-04-03  
**Author:** Drew (CEO) + Claude  
**Status:** Approved

---

## Overview

MTBox is an AI-powered software company where autonomous agents collaborate to build software products. The CEO (Drew) provides direction via Linear; agents plan, design, implement, and test autonomously, escalating decisions back to the CEO when needed.

All products are software (mobile apps, web apps, APIs, etc.). Each product gets its own Linear project and GitHub repository. The same agent team and workflow apply across all products.

---

## Company Structure

| Role | Type | Description |
|---|---|---|
| CEO (Drew) | Human | Creates issues, approves designs, makes decisions |
| PM | Cloud agent (remote) | Orchestrates workflow, breaks down issues, routes decisions |
| Designer | Local agent (Mac) | Creates HTML mockups, screenshots them, attaches to Linear |
| Programmer | Cloud agent (remote) | Implements features, opens PRs |
| QA | Local agent (Mac) | Writes and runs automated + E2E tests, posts manual checklists |

**CEO Linear account:** `levulinhkr` (ID: `adcd822a-946e-4d74-9c0b-1f55e274706b`)

---

## How the Company Works

### CEO Role

- Creates issues in any product's Linear project `Backlog` with a rough description
- Replies to agent comments in plain language — agents interpret and act
- Never needs to drag cards manually; the PM agent handles all routing
- Gets notified by Linear when an agent needs a decision

### Agent Coordination

Agents don't communicate directly with each other. They communicate through:
1. **Linear** — issue status, comments, and labels
2. **GitHub** — code, PRs, and commit history
3. **`docs/AGENTS.md`** in each repo — shared conventions and decisions
4. **`docs/memory/`** — each agent's own persistent memory

The PM agent is the only one that moves issues between statuses. All other agents do their work and signal completion; PM routes next.

---

## Linear Setup

**Workspace:** MTBox

### One Project Per Product

Each product gets its own Linear project inside the MTBox workspace. All projects share the same workflow statuses and label conventions so agents work the same way across products.

### Workflow Statuses (shared across all projects)

| Status | Owned by | Meaning |
|---|---|---|
| `Backlog` | CEO | Drew creates issues here with rough descriptions |
| `In Design` | Designer | PM has broken it down; Designer is building mockup |
| `Awaiting Design Approval` | CEO | Designer posted mockup; waiting for Drew's reply |
| `In Progress` | Programmer | Drew approved design; Programmer is implementing |
| `In Review` | QA | Programmer done; QA is testing |
| `Awaiting Decision` | CEO | Any agent needs Drew's judgment to continue |
| `Done` | — | Complete |

### Labels (shared across all projects)

`PM`, `Designer`, `Programmer`, `QA`, `Needs CEO Decision`

### Comment Convention

All agents post under Drew's Linear account. Every comment is prefixed with the agent's role tag:

```
[PM] Breaking this into 3 tasks: design, implementation, QA. Moving to In Design.
[Designer] Mockup attached. @levulinhkr please approve to proceed.
[Programmer] Implementation complete. PR: https://github.com/... Moving to In Review.
[QA] All 14 tests passing. Manual checklist below. Moving to Done.
```

---

## Agent Behavior

Agent behavior is identical across all products. The agents adapt to each product's tech stack by reading the repo's `CLAUDE.md` files.

### PM Agent

**Schedule:** Every 15 minutes (cloud)  
**Responsibilities:**
- Scan `Backlog` across all active projects → break issues into sub-tasks, write acceptance criteria, move to `In Design`
- Scan `Awaiting Design Approval` and `Awaiting Decision` → read Drew's latest reply, interpret intent, route to next status
- If Drew's intent is unclear → comment asking for clarification, add `Needs CEO Decision` label, @mention Drew
- Update `docs/AGENTS.md` in the relevant repo when architectural or style decisions are made
- Update own memory at end of each run

**Decision routing logic:**
- Positive reply on `Awaiting Design Approval` → move to `In Progress`
- Change request on `Awaiting Design Approval` → comment notes for Designer, move back to `In Design`
- Any reply on `Awaiting Decision` → interpret and route accordingly

### Designer Agent

**Schedule:** Every 30 minutes (local Mac)  
**Responsibilities:**
- Scan all active projects for issues in `In Design`
- Read PM's acceptance criteria, `AGENTS.md`, and own memory for design conventions
- Create an HTML mockup in `/mockups/<issue-id>/index.html` in the product repo
- Screenshot it using Playwright and attach the image to the Linear issue as a comment
- Move issue to `Awaiting Design Approval`, @mention Drew
- Update own memory at end of each run

### Programmer Agent

**Schedule:** Every 30 minutes (cloud)  
**Responsibilities:**
- Scan all active projects for issues in `In Progress`
- Read Designer's mockup, PM's acceptance criteria, `CLAUDE.md`, and `AGENTS.md` for conventions
- Implement the feature following the product's tech stack and existing patterns
- Commit and push to a feature branch, open a PR on GitHub
- Post PR link as a Linear comment, move issue to `In Review`
- Update own memory at end of each run

### QA Agent

**Schedule:** Every 30 minutes (local Mac)  
**Responsibilities:**
- Scan all active projects for issues in `In Review`
- Read the PR diff and acceptance criteria
- Write automated tests (unit, widget/component) and E2E integration tests
- Run all tests using the product's test commands (from `CLAUDE.md`)
- Post full test results as a Linear comment
- Post a manual visual/UX checklist as a follow-up comment
- If all pass → move to `Done`
- If failures → move back to `In Progress` with details; @mention Drew if judgment is needed
- Update own memory at end of each run

---

## Agent Memory

Each agent maintains a single persistent memory file across all products, updated every run:

```
docs/
└── memory/
    ├── pm-memory.md          # Issues processed, routing decisions, cross-product patterns
    ├── designer-memory.md    # Design decisions, component choices, feedback received
    ├── programmer-memory.md  # Architecture decisions, libraries used, patterns, past bugs
    └── qa-memory.md          # Known flaky tests, recurring issues, test strategies
```

Memory is agent-scoped, not product-scoped. Agents build knowledge across all products over time.

---

## Repository Structure (Per Product)

Each product has its own GitHub repository. The structure adapts to the tech stack but always includes:

```
<product-repo>/
├── CLAUDE.md                     # Project overview, tech stack, how to run, agent instructions
├── <source-dir>/                 # Product source code (e.g., lib/ for Flutter, src/ for web)
│   └── CLAUDE.md                 # Architecture, naming conventions, patterns
├── mockups/                      # Designer's HTML mockups
│   └── <issue-id>/
│       └── index.html
├── test/                         # Automated tests (unit, widget/component)
│   └── CLAUDE.md                 # Testing conventions, how to run tests
├── integration_test/             # E2E tests
│   └── CLAUDE.md                 # E2E setup, environment config
└── docs/
    └── AGENTS.md                 # Shared cross-agent context: conventions, decisions, history
```

### CLAUDE.md Requirements

Every product repo must have a root `CLAUDE.md` that includes:
- Product description and purpose
- Tech stack and key dependencies
- How to install and run locally
- How to run all tests (unit, integration, E2E) with exact commands
- Agent roles and responsibilities for this product
- Any product-specific conventions

---

## Orchestration Flow

This flow applies to every issue in every product:

```
Drew creates issue in Backlog
        ↓ (PM, up to 15 min)
PM breaks it down, writes acceptance criteria → In Design
        ↓ (Designer, up to 30 min)
Designer builds HTML mockup, screenshots with Playwright
Attaches image to Linear → Awaiting Design Approval, @levulinhkr
        ↓ (Drew replies)
        ↓ (PM, up to 15 min)
PM reads reply:
  - Approved → In Progress
  - Changes needed → In Design (with notes for Designer)
        ↓ (Programmer, up to 30 min)
Programmer implements, opens PR → In Review
        ↓ (QA, up to 30 min)
QA runs all tests, posts results + manual checklist
  - All pass → Done
  - Failures → In Progress (with details), @levulinhkr if judgment needed
```

**Worst-case latency (no revisions, Drew approves quickly):** ~2.5 hours end-to-end.

---

## Adding a New Product

When Drew wants to start a new product:

1. **Drew creates a Linear project** in the MTBox workspace with the product name
2. **Drew (or PM agent) creates a GitHub repo** with the product name
3. **Root `CLAUDE.md` is created** with product description, tech stack, run instructions, and test commands
4. **Drew creates the first issues** in `Backlog` — agents pick up from there

The agents need no reconfiguration — they discover active projects by scanning the MTBox Linear workspace each cycle.

---

## Scheduling

| Agent | Interval | Location | Trigger |
|---|---|---|---|
| PM | Every 15 min | Cloud (remote) | Claude Code RemoteTrigger |
| Designer | Every 30 min | Local Mac | macOS launchd |
| Programmer | Every 30 min | Cloud (remote) | Claude Code RemoteTrigger |
| QA | Every 30 min | Local Mac | macOS launchd |

**Mac requirements for local agents:** Mac must stay awake (no sleep). Screen lock and display off are fine. Configure in System Settings → Energy Saver → "Prevent automatic sleeping".

---

## Mac Setup Requirements

- Claude Code CLI installed and authenticated
- Linear MCP connected to Claude Code
- GitHub SSH key configured
- Playwright installed (for Designer screenshots)
- Each product's runtime and test toolchain installed (e.g., Flutter + Xcode for mobile apps)

---

## Current Products

| Product | Linear Project | GitHub Repo | Tech Stack | Status |
|---|---|---|---|---|
| Campaign Tracker | Campaign Tracker App | mtbox-app | Flutter (iOS + Android) | First product |

*Campaign Tracker is a mobile app for tracking personal habit and goal campaigns (e.g., "exercise 30 days", "read 10 books").*

---

## Out of Scope

- Non-software products
- Separate Linear bot accounts per agent (all agents post under Drew's account with role prefixes)
- Figma integration
- Android emulator E2E tests (iOS Simulator only to start)
