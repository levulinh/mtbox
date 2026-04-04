# MTBox

An AI-powered software company. Autonomous agents plan, design, implement, and test software products — you just give the direction.

## How It Works

You (CEO) create issues in Linear. A team of Claude Code agents picks them up, works through them, and ships code to GitHub — asking for your input only when genuinely needed.

```
CEO creates issue in Linear
        ↓
CTO generates roadmap + tasks
        ↓
PM breaks tasks into acceptance criteria → In Design
        ↓
Designer builds HTML mockup → Awaiting Design Approval
        ↓
CEO approves (or requests changes)
        ↓
Programmer implements, opens PR → In Review
        ↓
QA runs tests, posts results → Done
```

Worst-case end-to-end (no revisions): ~2.5 hours.

## Agents

| Agent | Role | Schedule |
|---|---|---|
| **CTO** | Reads your product directives, generates roadmaps, creates feature tasks | Every 2 hours |
| **PM** | Breaks tasks into acceptance criteria, routes issues through workflow | Every 15 min |
| **Designer** | Builds HTML mockups, screenshots with Playwright, posts to Linear | Every 30 min |
| **Programmer** | Implements features in Flutter, opens PRs on GitHub | Every 30 min |
| **QA** | Writes and runs tests, posts results + manual checklists | Every 30 min |

## Giving the CTO a New Direction

1. Open Linear → MTBox workspace → **CTO Directives** project
2. Create an issue with what you want to build — plain language, any technical preferences, business context
3. The CTO picks it up within 2 hours, generates a roadmap in the product repo, creates Phase 1 tasks, and reports back on the same issue

The roadmap lives at `docs/cto-roadmap.md` in each product repo. You can edit it directly at any time to steer.

## Dashboard

The dashboard runs at **http://localhost:4242** and shows live status, logs, and manual triggers for all agents.

```bash
# Start manually (normally runs via launchd)
bin/mtbox-dashboard
```

To keep it running automatically on Mac startup:
```bash
cp scripts/com.mtbox.dashboard.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.mtbox.dashboard.plist
```

## Monitoring

```bash
# Status summary for all agents
bash scripts/agent-status.sh

# Tail live logs (color-coded)
bash scripts/watch-agents.sh
bash scripts/watch-agents.sh cto   # single agent

# Manually trigger a run
bash scripts/run-cto.sh
bash scripts/run-pm.sh
```

## Mac Requirements

- Claude Code CLI installed and authenticated (`claude`)
- Linear MCP connected to Claude Code
- GitHub SSH key configured
- Playwright installed (`npm install -g playwright`)
- Mac must stay awake for local agents (System Settings → Energy Saver → prevent automatic sleeping)

## Current Products

| Product | Linear Project | Repo | Stack |
|---|---|---|---|
| Campaign Tracker | Campaign Tracker App | [mtbox-app](https://github.com/levulinh/mtbox-app) | Flutter (iOS + Android) |
