# MTBox Multi-Agent Company Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set up a fully automated AI software company with 4 agents (PM, Designer, Programmer, QA) collaborating via Linear and GitHub to build Flutter apps.

**Architecture:** Cloud-hosted agents (PM, Programmer) use Claude Code RemoteTrigger for scheduling; local Mac agents (Designer, QA) use macOS launchd. All agents coordinate via Linear issues and a shared GitHub repo. Each agent has its own persistent memory file.

**Tech Stack:** Claude Code CLI, Linear MCP, GitHub CLI (`gh`), Flutter SDK, Playwright (Node.js), macOS launchd

---

## Key Constants (referenced throughout plan)

- **Claude CLI path:** `/Users/lelinh/.local/bin/claude`
- **Flutter SDK path:** `/Volumes/ex-ssd/flutter/bin`
- **Company workspace:** `/Volumes/ex-ssd/workspace/mtbox`
- **App repo (local clone):** `/Volumes/ex-ssd/workspace/mtbox-app`
- **App repo (GitHub):** `https://github.com/levulinh/mtbox-app`
- **LaunchAgents dir:** `/Users/lelinh/Library/LaunchAgents`
- **Linear MTBox team ID:** `86ce1fdb-7a21-4eb3-a9cc-b0504f3363ad`
- **CEO Linear user ID:** `adcd822a-946e-4d74-9c0b-1f55e274706b`
- **CEO Linear username:** `levulinhkr`
- **GitHub username:** `levulinh`

---

## Phase 1: Prerequisites

### Task 1: Install Flutter SDK

**Files:** none (system-level install)

- [ ] **Step 1: Download Flutter**

```bash
cd ~
curl -O https://storage.googleapis.com/flutter_infra_release/releases/stable/macos/flutter_macos_arm64_3.27.4-stable.zip
unzip flutter_macos_arm64_3.27.4-stable.zip -d ~/development/
rm flutter_macos_arm64_3.27.4-stable.zip
```

- [ ] **Step 2: Add Flutter to PATH permanently**

Open `~/.zshrc` and add this line at the bottom:
```
export PATH="$HOME/Volumes/ex-ssd/flutter/bin:$PATH"
```

Then reload:
```bash
source ~/.zshrc
```

- [ ] **Step 3: Verify Flutter**

```bash
flutter --version
```

Expected output: `Flutter 3.x.x ...`

- [ ] **Step 4: Accept Flutter licenses and verify setup**

```bash
flutter doctor --android-licenses 2>/dev/null || true
flutter doctor
```

Expected: iOS toolchain ✓, Xcode ✓. Android tools can be skipped.

---

### Task 2: Install Playwright

**Files:** none (system-level install)

- [ ] **Step 1: Install Playwright via npm**

```bash
npm install -g playwright
playwright install chromium
```

- [ ] **Step 2: Verify Playwright**

```bash
node -e "const { chromium } = require('playwright'); chromium.launch().then(b => { console.log('Playwright OK'); b.close(); })"
```

Expected output: `Playwright OK`

---

## Phase 2: Linear Setup

### Task 3: Create the Linear Project

**Files:** none (Linear API)

- [ ] **Step 1: Create "Campaign Tracker App" project**

In Claude Code, run:
```
Use the Linear MCP tool save_project to create a project with:
- name: "Campaign Tracker App"
- team: "86ce1fdb-7a21-4eb3-a9cc-b0504f3363ad"
- description: "Flutter mobile app for tracking personal habit and goal campaigns."
```

- [ ] **Step 2: Note the project ID**

The `save_project` response includes an `id` field. Save it — you'll need it for agent prompts.

Run `list_projects` to confirm "Campaign Tracker App" appears.

---

### Task 4: Configure Workflow Statuses via Linear UI

**Files:** none (Linear UI — MCP doesn't support creating workflow states)

Linear workflow states are managed per-team in the Linear web UI.

- [ ] **Step 1: Open Linear in browser**

Go to: `https://linear.app` → MTBox workspace → Settings → Teams → MTBox → Workflow

- [ ] **Step 2: Set up the workflow states in this exact order**

Delete any default states that don't match, then create these (use "Add state" button):

| Name | Type | Color suggestion |
|---|---|---|
| Backlog | Backlog | Gray |
| In Design | Started | Blue |
| Awaiting Design Approval | Started | Purple |
| In Progress | Started | Yellow |
| In Review | Started | Orange |
| Awaiting Decision | Started | Red |
| Done | Completed | Green |

- [ ] **Step 3: Verify states appear in correct order**

Open the "Campaign Tracker App" project. Confirm the board shows all 7 columns in the correct order.

---

### Task 5: Create Linear Labels

**Files:** none (Linear MCP)

- [ ] **Step 1: Create the PM label**

```
Use Linear MCP create_issue_label:
- name: "PM"
- color: "#4A90E2"
- teamId: "86ce1fdb-7a21-4eb3-a9cc-b0504f3363ad"
```

- [ ] **Step 2: Create the Designer label**

```
Use Linear MCP create_issue_label:
- name: "Designer"
- color: "#9B59B6"
- teamId: "86ce1fdb-7a21-4eb3-a9cc-b0504f3363ad"
```

- [ ] **Step 3: Create the Programmer label**

```
Use Linear MCP create_issue_label:
- name: "Programmer"
- color: "#F39C12"
- teamId: "86ce1fdb-7a21-4eb3-a9cc-b0504f3363ad"
```

- [ ] **Step 4: Create the QA label**

```
Use Linear MCP create_issue_label:
- name: "QA"
- color: "#27AE60"
- teamId: "86ce1fdb-7a21-4eb3-a9cc-b0504f3363ad"
```

- [ ] **Step 5: Create the Needs CEO Decision label**

```
Use Linear MCP create_issue_label:
- name: "Needs CEO Decision"
- color: "#E74C3C"
- teamId: "86ce1fdb-7a21-4eb3-a9cc-b0504f3363ad"
```

- [ ] **Step 6: Verify all 5 labels exist**

```
Use Linear MCP list_issue_labels to confirm all 5 labels appear.
```

---

## Phase 3: GitHub Repository & Flutter App

### Task 6: Create GitHub Repo and Bootstrap Flutter App

**Files:**
- Create: `/Volumes/ex-ssd/workspace/mtbox-app/` (entire Flutter project)

- [ ] **Step 1: Create the GitHub repository**

```bash
gh repo create levulinh/mtbox-app \
  --public \
  --description "MTBox Campaign Tracker - Flutter mobile app for personal habit and goal tracking" \
  --clone \
  --gitignore Flutter
cd /Volumes/ex-ssd/workspace/mtbox-app
```

- [ ] **Step 2: Bootstrap Flutter project inside the cloned repo**

```bash
cd /Users/lelinh/workspace
flutter create --project-name mtbox_app --org com.mtbox --platforms ios,android .tmp_flutter_app
cp -r .tmp_flutter_app/. mtbox-app/
rm -rf .tmp_flutter_app
cd mtbox-app
```

- [ ] **Step 3: Create required directories**

```bash
mkdir -p mockups docs/memory integration_test lib/models lib/screens lib/widgets lib/services test/unit test/widget
```

- [ ] **Step 4: Verify Flutter app runs**

```bash
cd /Volumes/ex-ssd/workspace/mtbox-app
flutter pub get
flutter analyze
```

Expected: no errors.

- [ ] **Step 5: Initial commit**

```bash
cd /Volumes/ex-ssd/workspace/mtbox-app
git add .
git commit -m "feat: bootstrap Flutter app for MTBox Campaign Tracker"
git push origin main
```

---

### Task 7: Create CLAUDE.md Files

**Files:**
- Create: `/Volumes/ex-ssd/workspace/mtbox-app/CLAUDE.md`
- Create: `/Volumes/ex-ssd/workspace/mtbox-app/lib/CLAUDE.md`
- Create: `/Volumes/ex-ssd/workspace/mtbox-app/test/CLAUDE.md`
- Create: `/Volumes/ex-ssd/workspace/mtbox-app/integration_test/CLAUDE.md`
- Create: `/Volumes/ex-ssd/workspace/mtbox-app/mockups/CLAUDE.md`

- [ ] **Step 1: Create root CLAUDE.md**

```bash
cat > /Volumes/ex-ssd/workspace/mtbox-app/CLAUDE.md << 'EOF'
# MTBox Campaign Tracker

## Product
A Flutter mobile app that lets users create, track, and complete personal habit and goal campaigns (e.g., "exercise 30 days", "read 10 books").

## Tech Stack
- Flutter (latest stable)
- Dart
- State management: Riverpod
- Local storage: Hive
- Navigation: go_router

## How to Run
```bash
flutter pub get
flutter run
```

## How to Run Tests
```bash
# Unit + widget tests
flutter test test/

# E2E integration tests (requires iOS Simulator running)
open -a Simulator
flutter test integration_test/
```

## Agent Roles
- **PM**: Breaks down issues, writes acceptance criteria, routes workflow in Linear
- **Designer**: Creates HTML mockups in mockups/<issue-id>/, screenshots them
- **Programmer**: Implements features in lib/, opens PRs
- **QA**: Writes and runs tests in test/ and integration_test/

## Repository Layout
- `lib/` — Flutter app source code
- `mockups/` — HTML mockups per issue (mockups/<issue-id>/index.html)
- `test/` — Unit and widget tests
- `integration_test/` — E2E tests
- `docs/AGENTS.md` — Shared conventions for all agents
- `docs/memory/` — Per-agent persistent memory

## Linear
- Workspace: MTBox
- Project: Campaign Tracker App
- Workflow: Backlog → In Design → Awaiting Design Approval → In Progress → In Review → Awaiting Decision → Done
- CEO: levulinhkr (ID: adcd822a-946e-4d74-9c0b-1f55e274706b)
EOF
```

- [ ] **Step 2: Create lib/CLAUDE.md**

```bash
cat > /Volumes/ex-ssd/workspace/mtbox-app/lib/CLAUDE.md << 'EOF'
# Flutter App Architecture

## State Management: Riverpod
- Use `@riverpod` annotation for providers
- Providers live in `lib/providers/` (create this dir when first needed)
- UI reads state via `ref.watch()`; mutations via `ref.read().notifier`

## Navigation: go_router
- All routes defined in `lib/router.dart` (create when first needed)
- Use named routes (`GoRouter.of(context).goNamed('home')`)

## Local Storage: Hive
- Models that need persistence go in `lib/models/` and extend `HiveObject`
- Adapters generated via `build_runner`

## Naming Conventions
- Files: `snake_case.dart`
- Classes: `PascalCase`
- Variables/functions: `camelCase`
- Private members: `_leadingUnderscore`

## Folder Structure
- `lib/models/` — Dart data classes (Hive models)
- `lib/screens/` — Full-page widgets (one file per screen)
- `lib/widgets/` — Reusable UI components
- `lib/services/` — Business logic, data access
- `lib/providers/` — Riverpod providers (create when needed)

## Code Rules
- No business logic in widgets — delegate to services/providers
- Keep widgets small; extract to lib/widgets/ when > ~80 lines
- Always handle null safety explicitly
EOF
```

- [ ] **Step 3: Create test/CLAUDE.md**

```bash
cat > /Volumes/ex-ssd/workspace/mtbox-app/test/CLAUDE.md << 'EOF'
# Testing Conventions

## How to Run
```bash
flutter test test/
flutter test test/unit/my_test.dart  # single file
```

## Structure
- `test/unit/` — Pure Dart unit tests (models, services, providers)
- `test/widget/` — Flutter widget tests (UI components in isolation)

## Unit Tests (test/unit/)
Test models and services without Flutter framework:
```dart
import 'package:test/test.dart';
import 'package:mtbox_app/models/campaign.dart';

void main() {
  group('Campaign', () {
    test('isCompleted returns true when progress reaches goal', () {
      final campaign = Campaign(goal: 30, progress: 30);
      expect(campaign.isCompleted, isTrue);
    });
  });
}
```

## Widget Tests (test/widget/)
Test UI widgets in isolation using `WidgetTester`:
```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:mtbox_app/widgets/campaign_card.dart';

void main() {
  testWidgets('CampaignCard shows progress', (tester) async {
    await tester.pumpWidget(MaterialApp(home: CampaignCard(progress: 0.5)));
    expect(find.text('50%'), findsOneWidget);
  });
}
```

## Coverage Rules
- Every model class: test all computed properties and methods
- Every service: test all public methods with happy path + edge cases
- Every widget: test that it renders expected text/icons given props
EOF
```

- [ ] **Step 4: Create integration_test/CLAUDE.md**

```bash
cat > /Volumes/ex-ssd/workspace/mtbox-app/integration_test/CLAUDE.md << 'EOF'
# E2E Integration Tests

## Setup
Requires iOS Simulator running. Open it first:
```bash
open -a Simulator
```

## How to Run
```bash
flutter test integration_test/
```

## Structure
One file per major user flow:
- `integration_test/campaign_creation_test.dart` — creating a campaign
- `integration_test/campaign_tracking_test.dart` — logging progress
- Add more as features are added

## Template
```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:mtbox_app/main.dart' as app;

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  group('Campaign Creation', () {
    testWidgets('user can create a new campaign', (tester) async {
      app.main();
      await tester.pumpAndSettle();

      // Tap the "New Campaign" button
      await tester.tap(find.text('New Campaign'));
      await tester.pumpAndSettle();

      // Fill in campaign name
      await tester.enterText(find.byKey(Key('campaign_name')), '30-day run');
      await tester.tap(find.text('Create'));
      await tester.pumpAndSettle();

      // Verify campaign appears in the list
      expect(find.text('30-day run'), findsOneWidget);
    });
  });
}
```

## Rules
- Each test must start fresh (`app.main()` with clean state)
- Use `Key()` on interactive widgets so tests can find them reliably
- `pumpAndSettle()` after every tap/navigation to wait for animations
EOF
```

- [ ] **Step 5: Create mockups/CLAUDE.md**

```bash
cat > /Volumes/ex-ssd/workspace/mtbox-app/mockups/CLAUDE.md << 'EOF'
# Mockup Conventions

## Structure
One directory per Linear issue: `mockups/<linear-issue-id>/index.html`

## HTML Mockup Requirements
- Viewport: 375px wide (iPhone standard), full height
- Mimic a real mobile screen: status bar, navigation bar, content area
- Use the design system colors and fonts from docs/memory/designer-memory.md
- All interactive elements should look tappable (buttons with padding, rounded corners)
- Must visually match what a Flutter app would look like

## Screenshot Process (Designer agent)
Use Playwright to screenshot:
```javascript
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('file:///Volumes/ex-ssd/workspace/mtbox-app/mockups/<issue-id>/index.html');
  await page.screenshot({ path: '/tmp/<issue-id>-mockup.png', fullPage: false });
  await browser.close();
})();
```

## Design System (tracked in designer-memory.md)
The Designer agent tracks the established palette and typography in its memory file.
Always read designer-memory.md before creating a new mockup to stay consistent.
EOF
```

- [ ] **Step 6: Commit all CLAUDE.md files**

```bash
cd /Volumes/ex-ssd/workspace/mtbox-app
git add CLAUDE.md lib/CLAUDE.md test/CLAUDE.md integration_test/CLAUDE.md mockups/CLAUDE.md
git commit -m "docs: add CLAUDE.md files for all directories"
git push origin main
```

---

### Task 8: Create AGENTS.md and Memory Files

**Files:**
- Create: `/Volumes/ex-ssd/workspace/mtbox-app/docs/AGENTS.md`
- Create: `/Volumes/ex-ssd/workspace/mtbox-app/docs/memory/pm-memory.md`
- Create: `/Volumes/ex-ssd/workspace/mtbox-app/docs/memory/designer-memory.md`
- Create: `/Volumes/ex-ssd/workspace/mtbox-app/docs/memory/programmer-memory.md`
- Create: `/Volumes/ex-ssd/workspace/mtbox-app/docs/memory/qa-memory.md`

- [ ] **Step 1: Create docs/AGENTS.md**

```bash
cat > /Volumes/ex-ssd/workspace/mtbox-app/docs/AGENTS.md << 'EOF'
# MTBox Agent Shared Context

This file is maintained by the PM agent and read by all agents each run.
It records cross-cutting decisions that all agents must follow.

## Linear Identifiers
- Team ID: 86ce1fdb-7a21-4eb3-a9cc-b0504f3363ad
- CEO user ID: adcd822a-946e-4d74-9c0b-1f55e274706b
- CEO username: levulinhkr
- Project: Campaign Tracker App

## GitHub
- Repo: https://github.com/levulinh/mtbox-app
- Default branch: main
- Branch naming: feat/<linear-issue-id>-<short-description>

## Agent Comment Prefixes (always use these)
- PM: [PM]
- Designer: [Designer]
- Programmer: [Programmer]
- QA: [QA]

## Architecture Decisions
(PM agent appends here as decisions are made)

## Style Decisions
(Designer agent appends here as design system evolves)

## Known Issues / Things to Avoid
(Any agent appends here when discovering something important)
EOF
```

- [ ] **Step 2: Create pm-memory.md**

```bash
cat > /Volumes/ex-ssd/workspace/mtbox-app/docs/memory/pm-memory.md << 'EOF'
# PM Agent Memory

## Purpose
Track issues processed, routing decisions made, and patterns noticed across all runs.

## Issues Processed
(append each run)

## Routing Decisions
(append: "Issue X: CEO said Y → routed to Z because...")

## Patterns & Learnings
(append: observations about how the team works, what causes delays, etc.)
EOF
```

- [ ] **Step 3: Create designer-memory.md**

```bash
cat > /Volumes/ex-ssd/workspace/mtbox-app/docs/memory/designer-memory.md << 'EOF'
# Designer Agent Memory

## Purpose
Track design decisions, color palette, typography, and feedback received.

## Color Palette
(populate on first mockup — track all hex colors used)

## Typography
(populate on first mockup — font family, sizes used)

## Component Decisions
(e.g., "used bottom sheet for detail views, not modal dialogs")

## Feedback Received
(e.g., "CEO asked to make buttons larger on 2026-04-05")

## Mockups Created
(list: issue-id → what was designed)
EOF
```

- [ ] **Step 4: Create programmer-memory.md**

```bash
cat > /Volumes/ex-ssd/workspace/mtbox-app/docs/memory/programmer-memory.md << 'EOF'
# Programmer Agent Memory

## Purpose
Track architecture decisions, libraries used, patterns established, and things to avoid.

## Dependencies Added
(list: package name, version, reason)

## Architecture Decisions
(e.g., "using Riverpod for state management, added 2026-04-05")

## Patterns Established
(e.g., "all screens follow: Scaffold > CustomScrollView > SliverAppBar > SliverList")

## Things to Avoid
(e.g., "don't use setState in screens — use Riverpod providers")

## PRs Opened
(list: PR URL → issue-id → status)
EOF
```

- [ ] **Step 5: Create qa-memory.md**

```bash
cat > /Volumes/ex-ssd/workspace/mtbox-app/docs/memory/qa-memory.md << 'EOF'
# QA Agent Memory

## Purpose
Track known flaky tests, recurring issues, testing strategies that work.

## Known Flaky Tests
(list tests that occasionally fail for non-code reasons)

## Recurring Failure Patterns
(e.g., "animation timing issues in widget tests — always add extra pump()")

## Testing Strategies
(e.g., "use Keys on all Buttons in widgets to make widget tests reliable")

## Issues Tested
(list: issue-id → test files written → result)
EOF
```

- [ ] **Step 6: Commit all docs**

```bash
cd /Volumes/ex-ssd/workspace/mtbox-app
git add docs/
git commit -m "docs: add AGENTS.md and agent memory files"
git push origin main
```

---

## Phase 4: Agent Prompts

### Task 9: Write PM Agent Prompt

**Files:**
- Create: `/Volumes/ex-ssd/workspace/mtbox/agents/pm-prompt.md`

- [ ] **Step 1: Create agents directory**

```bash
mkdir -p /Volumes/ex-ssd/workspace/mtbox/agents
```

- [ ] **Step 2: Write the PM prompt**

```bash
cat > /Volumes/ex-ssd/workspace/mtbox/agents/pm-prompt.md << 'EOF'
You are the PM (Product Manager) agent for MTBox, an AI software company.

# Identity
- Prefix ALL Linear comments with: [PM]
- You are the ONLY agent authorized to move issues between workflow statuses
- You never write code, create mockups, or run tests

# Constants
- Linear MTBox team ID: 86ce1fdb-7a21-4eb3-a9cc-b0504f3363ad
- CEO Linear user ID: adcd822a-946e-4d74-9c0b-1f55e274706b
- App GitHub repo: https://github.com/levulinh/mtbox-app

# Workflow Statuses (in order)
Backlog → In Design → Awaiting Design Approval → In Progress → In Review → Awaiting Decision → Done

# What To Do Each Run

## 1. Read Your Memory
Clone or pull https://github.com/levulinh/mtbox-app and read docs/memory/pm-memory.md.
Read docs/AGENTS.md for current conventions.

## 2. Process Backlog Issues
For each issue in "Backlog" status in any MTBox project:
- Read the issue title and description
- Comment: "[PM] Acceptance criteria:\n- [list specific, testable criteria based on the description]\n\nMoving to In Design."
- Move issue to "In Design"
- If description is too vague to write criteria: comment "[PM] @[CEO user ID] — could you clarify what [specific unclear thing] should do? Moving to Awaiting Decision.", add "Needs CEO Decision" label, move to "Awaiting Decision"

## 3. Route Awaiting Design Approval Issues
For each issue in "Awaiting Design Approval":
- Read all issue comments
- Find the most recent comment by user ID adcd822a-946e-4d74-9c0b-1f55e274706b (CEO) that was posted AFTER the [Designer] mockup comment
- If no CEO comment yet: skip (wait)
- If CEO comment is positive (any of: "approved", "looks good", "go ahead", "yes", "LGTM", "ok", "perfect", "nice", "great"): comment "[PM] Design approved. Moving to In Progress." and move to "In Progress"
- If CEO comment requests changes: comment "[PM] CEO requested changes: [quote the relevant part]. Moving back to In Design for revision." and move to "In Design"

## 4. Route Awaiting Decision Issues
For each issue in "Awaiting Decision":
- Read all comments to understand what question was asked
- Find the most recent CEO comment after the question
- If no CEO reply yet: skip
- Interpret the response and route the issue to the appropriate next status
- Comment "[PM] Understood. [brief summary of decision]. Moving to [status]."

## 5. Update AGENTS.md
If any new architectural or design decision was established today, append it to docs/AGENTS.md, commit, and push.

## 6. Update Your Memory
Append to docs/memory/pm-memory.md:
- Date and issues processed
- Routing decisions made and reasoning
- Any patterns noticed
Commit: git commit -m "chore: pm agent memory update [date]"
Push to main.

# Rules
- Always prefix comments with [PM]
- To @mention CEO in Linear comments, use their user ID: adcd822a-946e-4d74-9c0b-1f55e274706b
- Read AGENTS.md conventions before writing acceptance criteria
- When uncertain, move to "Awaiting Decision" and ask a specific question — never guess
- Do not process the same issue twice in one run (check for existing [PM] comments)
EOF
```

---

### Task 10: Write Designer Agent Prompt

**Files:**
- Create: `/Volumes/ex-ssd/workspace/mtbox/agents/designer-prompt.md`

- [ ] **Step 1: Write the Designer prompt**

```bash
cat > /Volumes/ex-ssd/workspace/mtbox/agents/designer-prompt.md << 'EOF'
You are the Designer agent for MTBox, an AI software company.

# Identity
- Prefix ALL Linear comments with: [Designer]
- You create HTML mockups, screenshot them with Playwright, and attach to Linear issues
- You pick up issues in "In Design" and move them to "Awaiting Design Approval"

# Constants
- Linear MTBox team ID: 86ce1fdb-7a21-4eb3-a9cc-b0504f3363ad
- CEO Linear user ID: adcd822a-946e-4d74-9c0b-1f55e274706b
- App local path: /Volumes/ex-ssd/workspace/mtbox-app

# What To Do Each Run

## 1. Read Your Memory
Read /Volumes/ex-ssd/workspace/mtbox-app/docs/memory/designer-memory.md for established colors, fonts, component styles.
Read /Volumes/ex-ssd/workspace/mtbox-app/docs/AGENTS.md for conventions.
Read /Volumes/ex-ssd/workspace/mtbox-app/mockups/CLAUDE.md for mockup format.

## 2. Pull Latest Repo
Run: cd /Volumes/ex-ssd/workspace/mtbox-app && git pull origin main

## 3. Find Issues In Design
Get all issues in "In Design" status from all MTBox projects.
For each issue: check if a [Designer] comment already exists. If yes: skip (already handled).

## 4. Create Mockup For Each Issue
For each unhandled "In Design" issue:

### 4a. Create the HTML mockup
- Read PM's acceptance criteria comment carefully
- Create directory: /Volumes/ex-ssd/workspace/mtbox-app/mockups/<issue-id>/
- Create index.html with a realistic 375px-wide mobile screen mockup
- Use the colors and fonts from designer-memory.md (or establish them if this is the first mockup)
- Show ALL UI elements mentioned in the acceptance criteria
- Style: clean, modern Flutter-like mobile UI (think Material Design 3)

HTML template to base off:
```html
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=375">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { width: 375px; min-height: 812px; font-family: 'SF Pro Display', -apple-system, sans-serif; background: #F5F5F5; }
    .status-bar { height: 44px; background: [primary-color]; display: flex; align-items: center; padding: 0 16px; color: white; font-size: 14px; justify-content: space-between; }
    .app-bar { height: 56px; background: [primary-color]; display: flex; align-items: center; padding: 0 16px; color: white; }
    .app-bar h1 { font-size: 20px; font-weight: 600; }
    .content { padding: 16px; }
    /* Add more styles as needed */
  </style>
</head>
<body>
  <div class="status-bar"><span>9:41</span><span>●●●</span></div>
  <div class="app-bar"><h1>[Screen Title]</h1></div>
  <div class="content">
    <!-- Add the UI for this feature here -->
  </div>
</body>
</html>
```

### 4b. Screenshot the mockup using Playwright
Save the screenshot directly into the mockups directory (not /tmp) so it's committed with the HTML.
Create a temp Node.js script at /tmp/screenshot-<issue-id>.js:
```javascript
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('file:///Volumes/ex-ssd/workspace/mtbox-app/mockups/<issue-id>/index.html');
  await page.waitForTimeout(500);
  await page.screenshot({ path: '/Volumes/ex-ssd/workspace/mtbox-app/mockups/<issue-id>/mockup.png' });
  await browser.close();
  console.log('Screenshot saved');
})();
```
Run: node /tmp/screenshot-<issue-id>.js

### 4c. Commit mockup files to GitHub first
```bash
cd /Volumes/ex-ssd/workspace/mtbox-app
git add mockups/<issue-id>/
git commit -m "design: add mockup for <issue-id>"
git push origin main
```
The screenshot is now accessible at:
`https://raw.githubusercontent.com/levulinh/mtbox-app/main/mockups/<issue-id>/mockup.png`

### 4d. Comment on Linear with embedded image
Use Linear MCP save_comment to post on the issue:
```
[Designer] Mockup ready for [Issue Title].

![Mockup](https://raw.githubusercontent.com/levulinh/mtbox-app/main/mockups/<issue-id>/mockup.png)

Design notes:
- [briefly describe key design decisions made]
- [note color/typography choices if establishing palette for the first time]

@[CEO user ID] please review and reply with approval or feedback to proceed.
```

### 4e. Move issue to "Awaiting Design Approval"
Use Linear MCP to update the issue status to "Awaiting Design Approval".

## 6. Update Your Memory
Append to /Volumes/ex-ssd/workspace/mtbox-app/docs/memory/designer-memory.md:
- Colors used (with hex codes) — especially if establishing palette for the first time
- Font choices
- Component decisions
- Issues designed this run
Commit and push: git commit -m "chore: designer memory update" && git push

# Rules
- Always prefix comments with [Designer]
- NEVER proceed without reading designer-memory.md first — consistency is critical
- When @mentioning CEO, use user ID: adcd822a-946e-4d74-9c0b-1f55e274706b
- If acceptance criteria is unclear, @mention CEO, add "Needs CEO Decision" label, move to "Awaiting Decision"
- Clean up /tmp/screenshot-*.js and /tmp/*-mockup.png after attaching to Linear
EOF
```

---

### Task 11: Write Programmer Agent Prompt

**Files:**
- Create: `/Volumes/ex-ssd/workspace/mtbox/agents/programmer-prompt.md`

- [ ] **Step 1: Write the Programmer prompt**

```bash
cat > /Volumes/ex-ssd/workspace/mtbox/agents/programmer-prompt.md << 'EOF'
You are the Programmer agent for MTBox, an AI software company.

# Identity
- Prefix ALL Linear comments with: [Programmer]
- You implement features in Flutter based on approved mockups and acceptance criteria
- You pick up issues in "In Progress" and move them to "In Review"

# Constants
- Linear MTBox team ID: 86ce1fdb-7a21-4eb3-a9cc-b0504f3363ad
- CEO Linear user ID: adcd822a-946e-4d74-9c0b-1f55e274706b
- App GitHub repo: https://github.com/levulinh/mtbox-app

# What To Do Each Run

## 1. Set Up Workspace
```bash
cd /tmp
git clone https://github.com/levulinh/mtbox-app.git mtbox-app-work || (cd mtbox-app-work && git pull)
cd mtbox-app-work
```

## 2. Read Your Memory
Read docs/memory/programmer-memory.md for past architecture decisions, libraries used, patterns.
Read CLAUDE.md and lib/CLAUDE.md for coding conventions.
Read docs/AGENTS.md for cross-agent conventions.

## 3. Find Issues In Progress
Get all issues in "In Progress" status from all MTBox projects.
For each issue: check if a [Programmer] comment already exists. If yes: skip.

## 4. Implement Feature For Each Issue
For each unhandled "In Progress" issue:

### 4a. Read context
- Read issue description
- Find [PM] comment with acceptance criteria
- Find [Designer] comment with mockup reference
- Read the mockup HTML at mockups/<issue-id>/index.html for visual reference

### 4b. Create feature branch
```bash
git checkout main && git pull
git checkout -b feat/<issue-id>-<short-title>
```

### 4c. Implement
- Write clean Flutter code in lib/ following conventions in lib/CLAUDE.md
- Follow patterns from programmer-memory.md
- Add any required packages to pubspec.yaml with `flutter pub add <package>`
- Keep implementation focused — only what the acceptance criteria requires

### 4d. Verify it compiles
```bash
flutter pub get
flutter analyze
```
Fix any analysis errors before proceeding.

### 4e. Commit and push
```bash
git add lib/ pubspec.yaml pubspec.lock
git commit -m "feat: [brief description] (issue: <issue-id>)"
git push origin feat/<issue-id>-<short-title>
```

### 4f. Open PR
```bash
gh pr create \
  --title "[Issue Title]" \
  --body "## What\n[brief description]\n\n## Linear Issue\n<issue-id>\n\n## Acceptance Criteria\n[paste from PM comment]" \
  --base main
```

### 4g. Comment on Linear and move issue
Comment: "[Programmer] Implementation complete.

PR: [PR URL]

What was implemented:
- [bullet list of what was built]

Moving to In Review."

Move issue to "In Review".

## 5. Update Your Memory
Append to docs/memory/programmer-memory.md:
- Any new packages added
- Architecture decisions made
- Patterns established
- PRs opened
Commit on the main branch and push.

## 6. Clean Up
```bash
rm -rf /tmp/mtbox-app-work
```

# Rules
- Always prefix comments with [Programmer]
- NEVER commit directly to main — always feature branches + PRs
- Follow lib/CLAUDE.md conventions strictly
- Run flutter analyze before every commit — fix all warnings
- Keep PRs small: one issue per PR
- When @mentioning CEO, use user ID: adcd822a-946e-4d74-9c0b-1f55e274706b
EOF
```

---

### Task 12: Write QA Agent Prompt

**Files:**
- Create: `/Volumes/ex-ssd/workspace/mtbox/agents/qa-prompt.md`

- [ ] **Step 1: Write the QA prompt**

```bash
cat > /Volumes/ex-ssd/workspace/mtbox/agents/qa-prompt.md << 'EOF'
You are the QA (Quality Assurance) agent for MTBox, an AI software company.

# Identity
- Prefix ALL Linear comments with: [QA]
- You write and run automated tests and post manual QA checklists
- You pick up issues in "In Review"

# Constants
- Linear MTBox team ID: 86ce1fdb-7a21-4eb3-a9cc-b0504f3363ad
- CEO Linear user ID: adcd822a-946e-4d74-9c0b-1f55e274706b
- App local path: /Volumes/ex-ssd/workspace/mtbox-app

# What To Do Each Run

## 1. Read Your Memory
Read /Volumes/ex-ssd/workspace/mtbox-app/docs/memory/qa-memory.md for known issues, strategies.

## 2. Pull Latest
```bash
cd /Volumes/ex-ssd/workspace/mtbox-app && git pull origin main
```

## 3. Find Issues In Review
Get all issues in "In Review" status from all MTBox projects.
For each issue: check if a [QA] test results comment already exists. If yes: skip.

## 4. Test Each Issue
For each unhandled "In Review" issue:

### 4a. Read context
- Read issue description and [PM] acceptance criteria comment
- Find [Programmer] comment to get the PR URL
- Check out the PR branch:
  ```bash
  cd /Volumes/ex-ssd/workspace/mtbox-app
  gh pr checkout <PR-number-from-programmer-comment>
  ```

### 4b. Write unit tests
Create test/unit/<feature-name>_test.dart:
- Test all new model classes (computed properties, methods)
- Test all new service methods (happy path + edge cases)
- Follow test/CLAUDE.md conventions

### 4c. Write widget tests
Create test/widget/<feature-name>_test.dart:
- Test that new widgets render expected content given different props
- Test interaction (taps, form input)
- Follow test/CLAUDE.md conventions

### 4d. Write E2E integration test
Create integration_test/<feature-name>_test.dart:
- Cover the main user flow end-to-end
- Follow integration_test/CLAUDE.md conventions
- Use Keys on interactive widgets (if missing from implementation, note in Linear comment)

### 4e. Run unit + widget tests
```bash
cd /Volumes/ex-ssd/workspace/mtbox-app
flutter test test/ 2>&1 | tee /tmp/unit-test-results.txt
```

### 4f. Run E2E tests
```bash
open -a Simulator
sleep 5
flutter test integration_test/ 2>&1 | tee /tmp/e2e-test-results.txt
```

### 4g. Post results on Linear
Comment 1 — test results:
"[QA] Test Results for [Issue Title]

**Unit/Widget Tests:**
```
[paste content of /tmp/unit-test-results.txt — last 20 lines]
```

**E2E Tests:**
```
[paste content of /tmp/e2e-test-results.txt — last 20 lines]
```"

Comment 2 — manual checklist:
"[QA] Manual QA Checklist

- [ ] UI matches the approved mockup (see [Designer] comment)
- [ ] [acceptance criterion 1 rephrased as a check]
- [ ] [acceptance criterion 2 rephrased as a check]
- [ ] No visible regressions on other screens
- [ ] Text is readable and properly sized
- [ ] Tappable elements have enough touch target size"

### 4h. Route the issue
**If all tests pass:**
- Merge the PR: `gh pr merge <PR-url> --squash --delete-branch`
- Move issue to "Done"
- Comment: "[QA] All tests passing. PR merged. Moving to Done. ✓"

**If tests fail:**
- Move issue back to "In Progress"
- Comment: "[QA] Tests failing. Details above. Moving back to In Progress.
  
  Root cause: [brief analysis of what's failing and why]
  
  [If a decision is needed]: @[CEO user ID] — [specific question]"
- If CEO judgment needed: add "Needs CEO Decision" label

## 5. Update Your Memory
Append to /Volumes/ex-ssd/workspace/mtbox-app/docs/memory/qa-memory.md:
- Issues tested this run
- Any flaky tests discovered
- Patterns in failures
- Testing strategies that worked
```bash
cd /Volumes/ex-ssd/workspace/mtbox-app
git add docs/memory/qa-memory.md test/ integration_test/
git commit -m "test: add tests for <issue-id> + qa memory update"
git push origin main
```

## 6. Clean Up
```bash
rm -f /tmp/unit-test-results.txt /tmp/e2e-test-results.txt
```

# Rules
- Always prefix comments with [QA]
- Write tests before running them
- Cover happy path AND edge cases AND error states
- When @mentioning CEO, use user ID: adcd822a-946e-4d74-9c0b-1f55e274706b
- If you can't check out the PR branch, @mention CEO and move to "Awaiting Decision"
EOF
```

---

## Phase 5: Scheduling

### Task 13: Schedule PM Agent (Cloud, Every 15 Minutes)

**Files:** none (Claude Code cloud configuration)

- [ ] **Step 1: Create the PM agent schedule**

In a Claude Code session, run the `schedule` skill to create a remote trigger:

```
/schedule
```

When prompted, provide:
- **Name:** MTBox PM Agent
- **Schedule:** `*/15 * * * *` (every 15 minutes)
- **Prompt:** (paste full contents of `/Volumes/ex-ssd/workspace/mtbox/agents/pm-prompt.md`)
- **Allowed tools:** `Bash`, `Read`, `Write`, `Edit`, `Glob`, `Grep`, `mcp__claude_ai_Linear__*`

- [ ] **Step 2: Verify schedule was created**

```
/schedule list
```

Confirm "MTBox PM Agent" appears with `*/15 * * * *` schedule.

---

### Task 14: Schedule Programmer Agent (Cloud, Every 30 Minutes)

**Files:** none (Claude Code cloud configuration)

- [ ] **Step 1: Create the Programmer agent schedule**

In a Claude Code session:

```
/schedule
```

When prompted:
- **Name:** MTBox Programmer Agent
- **Schedule:** `*/30 * * * *` (every 30 minutes)
- **Prompt:** (paste full contents of `/Volumes/ex-ssd/workspace/mtbox/agents/programmer-prompt.md`)
- **Allowed tools:** `Bash`, `Read`, `Write`, `Edit`, `Glob`, `Grep`, `mcp__claude_ai_Linear__*`

- [ ] **Step 2: Verify**

```
/schedule list
```

Confirm "MTBox Programmer Agent" appears.

---

### Task 15: Set Up Designer Agent (Local Mac, Every 30 Minutes)

**Files:**
- Create: `/Volumes/ex-ssd/workspace/mtbox/scripts/run-designer.sh`
- Create: `/Users/lelinh/Library/LaunchAgents/com.mtbox.designer.plist`
- Create: `/Volumes/ex-ssd/workspace/mtbox/logs/` (directory)

- [ ] **Step 1: Create logs directory**

```bash
mkdir -p /Volumes/ex-ssd/workspace/mtbox/logs
```

- [ ] **Step 2: Create the run script**

```bash
mkdir -p /Volumes/ex-ssd/workspace/mtbox/scripts
cat > /Volumes/ex-ssd/workspace/mtbox/scripts/run-designer.sh << 'EOF'
#!/bin/bash
set -e

PROMPT_FILE="/Volumes/ex-ssd/workspace/mtbox/agents/designer-prompt.md"
LOG_FILE="/Volumes/ex-ssd/workspace/mtbox/logs/designer.log"

echo "=== Designer Agent Run: $(date) ===" >> "$LOG_FILE"

/Users/lelinh/.local/bin/claude \
  --print \
  --dangerously-skip-permissions \
  --allowedTools "Bash,Read,Write,Edit,Glob,Grep,mcp__claude_ai_Linear__*,mcp__plugin_playwright_playwright__*" \
  --model sonnet \
  "$(cat "$PROMPT_FILE")" >> "$LOG_FILE" 2>&1

echo "=== Done: $(date) ===" >> "$LOG_FILE"
EOF
chmod +x /Volumes/ex-ssd/workspace/mtbox/scripts/run-designer.sh
```

- [ ] **Step 3: Create the launchd plist**

```bash
cat > /Users/lelinh/Library/LaunchAgents/com.mtbox.designer.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.mtbox.designer</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>/Volumes/ex-ssd/workspace/mtbox/scripts/run-designer.sh</string>
    </array>
    <key>StartInterval</key>
    <integer>1800</integer>
    <key>RunAtLoad</key>
    <false/>
    <key>StandardOutPath</key>
    <string>/Volumes/ex-ssd/workspace/mtbox/logs/designer-launchd.log</string>
    <key>StandardErrorPath</key>
    <string>/Volumes/ex-ssd/workspace/mtbox/logs/designer-launchd-error.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/Users/lelinh/Volumes/ex-ssd/flutter/bin</string>
        <key>HOME</key>
        <string>/Users/lelinh</string>
    </dict>
</dict>
</plist>
EOF
```

- [ ] **Step 4: Load the launchd job**

```bash
launchctl load /Users/lelinh/Library/LaunchAgents/com.mtbox.designer.plist
launchctl list | grep mtbox.designer
```

Expected: entry for `com.mtbox.designer` appears.

---

### Task 16: Set Up QA Agent (Local Mac, Every 30 Minutes)

**Files:**
- Create: `/Volumes/ex-ssd/workspace/mtbox/scripts/run-qa.sh`
- Create: `/Users/lelinh/Library/LaunchAgents/com.mtbox.qa.plist`

- [ ] **Step 1: Create the run script**

```bash
cat > /Volumes/ex-ssd/workspace/mtbox/scripts/run-qa.sh << 'EOF'
#!/bin/bash
set -e

PROMPT_FILE="/Volumes/ex-ssd/workspace/mtbox/agents/qa-prompt.md"
LOG_FILE="/Volumes/ex-ssd/workspace/mtbox/logs/qa.log"

echo "=== QA Agent Run: $(date) ===" >> "$LOG_FILE"

/Users/lelinh/.local/bin/claude \
  --print \
  --dangerously-skip-permissions \
  --allowedTools "Bash,Read,Write,Edit,Glob,Grep,mcp__claude_ai_Linear__*" \
  --model sonnet \
  "$(cat "$PROMPT_FILE")" >> "$LOG_FILE" 2>&1

echo "=== Done: $(date) ===" >> "$LOG_FILE"
EOF
chmod +x /Volumes/ex-ssd/workspace/mtbox/scripts/run-qa.sh
```

- [ ] **Step 2: Create the launchd plist**

```bash
cat > /Users/lelinh/Library/LaunchAgents/com.mtbox.qa.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.mtbox.qa</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>/Volumes/ex-ssd/workspace/mtbox/scripts/run-qa.sh</string>
    </array>
    <key>StartInterval</key>
    <integer>1800</integer>
    <key>RunAtLoad</key>
    <false/>
    <key>StandardOutPath</key>
    <string>/Volumes/ex-ssd/workspace/mtbox/logs/qa-launchd.log</string>
    <key>StandardErrorPath</key>
    <string>/Volumes/ex-ssd/workspace/mtbox/logs/qa-launchd-error.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/Users/lelinh/Volumes/ex-ssd/flutter/bin</string>
        <key>HOME</key>
        <string>/Users/lelinh</string>
    </dict>
</dict>
</plist>
EOF
```

- [ ] **Step 3: Load the launchd job**

```bash
launchctl load /Users/lelinh/Library/LaunchAgents/com.mtbox.qa.plist
launchctl list | grep mtbox.qa
```

Expected: entry for `com.mtbox.qa` appears.

---

## Phase 6: Mac Configuration

### Task 17: Configure Mac to Prevent Sleep

**Files:** none (System Settings)

- [ ] **Step 1: Open Energy Saver settings**

```bash
open "x-apple.systempreferences:com.apple.preference.energysaver"
```

- [ ] **Step 2: Configure sleep settings**

In System Settings → Energy Saver (or Battery):
- Set **"Turn display off after"** → can be any value (display sleep is fine)
- Set **"Prevent automatic sleeping when display is off"** → **ON** (or set "Sleep" to Never)

The Mac display can turn off; the Mac itself must not sleep.

- [ ] **Step 3: Verify with caffeinate (optional test)**

To test that the Mac stays awake, you can optionally run:
```bash
# This keeps the Mac awake for 1 hour — just for testing
caffeinate -t 3600 &
```

---

## Phase 7: Verification

### Task 18: Manual Agent Dry-Run

**Files:** none

- [ ] **Step 1: Create a test Linear issue**

In Linear, create an issue in "Campaign Tracker App" project, status "Backlog":
- Title: "Test: Campaign list screen"
- Description: "Show a list of all the user's active campaigns. Each campaign shows its name, goal, current progress, and a progress bar."

- [ ] **Step 2: Run the PM agent manually**

```bash
/Users/lelinh/.local/bin/claude \
  --print \
  --dangerously-skip-permissions \
  --allowedTools "Bash,Read,Write,Edit,Glob,Grep,mcp__claude_ai_Linear__*" \
  --model sonnet \
  "$(cat /Volumes/ex-ssd/workspace/mtbox/agents/pm-prompt.md)"
```

- [ ] **Step 3: Verify PM agent actions**

Check Linear: the test issue should now be in "In Design" with a [PM] comment containing acceptance criteria.

- [ ] **Step 4: Run the Designer agent manually**

```bash
/Users/lelinh/.local/bin/claude \
  --print \
  --dangerously-skip-permissions \
  --allowedTools "Bash,Read,Write,Edit,Glob,Grep,mcp__claude_ai_Linear__*,mcp__plugin_playwright_playwright__*" \
  --model sonnet \
  "$(cat /Volumes/ex-ssd/workspace/mtbox/agents/designer-prompt.md)"
```

- [ ] **Step 5: Verify Designer agent actions**

Check Linear: the issue should now be in "Awaiting Design Approval" with a [Designer] comment containing an attached screenshot.

Check local filesystem: `ls /Volumes/ex-ssd/workspace/mtbox-app/mockups/` should show the new mockup directory.

- [ ] **Step 6: Reply to approve the design**

In Linear, reply to the Designer's comment: "Looks good, approved."

- [ ] **Step 7: Run PM agent again to route approval**

```bash
/Users/lelinh/.local/bin/claude \
  --print \
  --dangerously-skip-permissions \
  --allowedTools "Bash,Read,Write,Edit,Glob,Grep,mcp__claude_ai_Linear__*" \
  --model sonnet \
  "$(cat /Volumes/ex-ssd/workspace/mtbox/agents/pm-prompt.md)"
```

Check Linear: issue should now be in "In Progress".

- [ ] **Step 8: Verify launchd jobs are running**

```bash
launchctl list | grep mtbox
```

Both `com.mtbox.designer` and `com.mtbox.qa` should appear.
Check logs:
```bash
tail -20 /Volumes/ex-ssd/workspace/mtbox/logs/designer.log
tail -20 /Volumes/ex-ssd/workspace/mtbox/logs/qa.log
```

- [ ] **Step 9: Commit agent scripts and prompts**

```bash
cd /Volumes/ex-ssd/workspace/mtbox
git init
git add agents/ scripts/ docs/
git commit -m "feat: add MTBox agent prompts, scripts, and company spec"
```

---

## Reference: Agent Run Commands (for manual testing)

```bash
# PM agent
/Users/lelinh/.local/bin/claude --print --dangerously-skip-permissions \
  --allowedTools "Bash,Read,Write,Edit,Glob,Grep,mcp__claude_ai_Linear__*" \
  --model sonnet "$(cat /Volumes/ex-ssd/workspace/mtbox/agents/pm-prompt.md)"

# Designer agent
/Users/lelinh/.local/bin/claude --print --dangerously-skip-permissions \
  --allowedTools "Bash,Read,Write,Edit,Glob,Grep,mcp__claude_ai_Linear__*,mcp__plugin_playwright_playwright__*" \
  --model sonnet "$(cat /Volumes/ex-ssd/workspace/mtbox/agents/designer-prompt.md)"

# Programmer agent
/Users/lelinh/.local/bin/claude --print --dangerously-skip-permissions \
  --allowedTools "Bash,Read,Write,Edit,Glob,Grep,mcp__claude_ai_Linear__*" \
  --model sonnet "$(cat /Volumes/ex-ssd/workspace/mtbox/agents/programmer-prompt.md)"

# QA agent
/Users/lelinh/.local/bin/claude --print --dangerously-skip-permissions \
  --allowedTools "Bash,Read,Write,Edit,Glob,Grep,mcp__claude_ai_Linear__*" \
  --model sonnet "$(cat /Volumes/ex-ssd/workspace/mtbox/agents/qa-prompt.md)"
```

## Reference: Troubleshooting

```bash
# Check launchd job status
launchctl list | grep mtbox

# Unload and reload a job (if updating plist)
launchctl unload /Users/lelinh/Library/LaunchAgents/com.mtbox.designer.plist
launchctl load /Users/lelinh/Library/LaunchAgents/com.mtbox.designer.plist

# Watch logs live
tail -f /Volumes/ex-ssd/workspace/mtbox/logs/designer.log

# Force a manual run of launchd job
launchctl start com.mtbox.designer
launchctl start com.mtbox.qa
```
