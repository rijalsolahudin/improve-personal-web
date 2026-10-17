# Graph Report - improve-personal  (2026-10-09)

## Corpus Check
- Corpus is ~8,040 words - fits in a single context window. You may not need a graph.

## Summary
- 98 nodes · 134 edges · 7 communities
- Extraction: 90% EXTRACTED · 10% INFERRED · 1% AMBIGUOUS · INFERRED: 13 edges (avg confidence: 0.82)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Planning Core (Todo, Eisenhower, Pomodoro)
- Habit, Memo & Home Widgets
- Guide, Import/Export & Local-first
- Schedule, Calendar & Recurrence
- Overview Analytics
- Sticker & Delta Sync
- Accounts, Auth & E2EE Sync

## God Nodes (most connected - your core abstractions)
1. `F13 Goals` - 15 edges
2. `F11 Overview` - 12 edges
3. `PRD Improve Personal (README)` - 11 edges
4. `F12 Home` - 11 edges
5. `F8 Memo / Jurnal` - 10 edges
6. `F2 To-do list` - 8 edges
7. `F6 Calendar` - 8 edges
8. `F7 Habit` - 8 edges
9. `F15 Account, Sync & Security` - 8 edges
10. `F1 Schedule` - 7 edges

## Surprising Connections (you probably didn't know these)
- `Productive Day Streak` --shares_data_with--> `F12 Home`  [INFERRED]
  docs/PRD/features/F11-overview.md → docs/PRD/features/F12-home.md
- `Dynamic remaining time` --semantically_similar_to--> `Dynamic countdown units`  [INFERRED] [semantically similar]
  docs/PRD/features/F02-todo.md → docs/PRD/features/F05-countdown.md
- `Single global timer (not per-item interval)` --semantically_similar_to--> `Dynamic countdown units`  [INFERRED] [semantically similar]
  docs/PRD/features/F02-todo.md → docs/PRD/features/F05-countdown.md
- `Session history` --shares_data_with--> `F11 Overview`  [EXTRACTED]
  docs/PRD/features/F04-pomodoro.md → docs/PRD/features/F11-overview.md
- `Pomodoro Home widget` --references--> `F12 Home`  [EXTRACTED]
  docs/PRD/features/F04-pomodoro.md → docs/PRD/features/F12-home.md

## Hyperedges (group relationships)
- **E2EE sync and account stack** — docs_prd_requirements_t19_server_accounts, docs_prd_requirements_t20_e2ee_crypto, docs_prd_requirements_t21_sync_engine, docs_prd_readme_e2ee [INFERRED 0.85]
- **Calendar aggregates schedule, task and countdown** — docs_prd_features_f06_calendar, docs_prd_features_f01_schedule, docs_prd_features_f02_todo, docs_prd_features_f05_countdown [EXTRACTED 1.00]
- **Task to Eisenhower to Pomodoro focus flow** — docs_prd_features_f02_todo, docs_prd_features_f03_eisenhower, docs_prd_features_f04_pomodoro [INFERRED 0.85]
- **Goal progress from linked habits, tasks, schedules** — docs_prd_features_f13_goals_item_linking, docs_prd_features_f13_goals_progress_calculation, docs_prd_features_f07_habit, docs_prd_features_f13_goals_chapter [INFERRED 0.85]
- **E2EE layered unlockers protecting master key** — docs_prd_features_f15_account_sync_e2ee_master_key, docs_prd_features_f15_account_sync_recovery_key, docs_prd_features_f15_account_sync_passwordless_login, docs_prd_features_f15_account_sync_add_device [EXTRACTED 0.95]
- **Goal periodic review flow (Goals, Home card, Memo)** — docs_prd_features_f13_goals_periodic_review, docs_prd_features_f12_home_review_card, docs_prd_features_f08_memo [EXTRACTED 0.95]

## Communities (7 total, 0 thin omitted)

### Community 0 - "Planning Core (Todo, Eisenhower, Pomodoro)"
Cohesion: 0.10
Nodes (20): Assumptions & Open Questions, Open questions (default), F2 To-do list, Dynamic remaining time, Task-to-schedule link, F3 Eisenhower matrix, Drag and drop (mouse + touch), Four quadrants (+12 more)

### Community 1 - "Habit, Memo & Home Widgets"
Cohesion: 0.13
Nodes (21): F7 Habit, Habit Streak, F8 Memo / Jurnal, Markdown Sanitization, Schedule Mention (@) chip, F12 Home, Goal Aktif Widget, Home Pomodoro Widget (+13 more)

### Community 2 - "Guide, Import/Export & Local-first"
Cohesion: 0.16
Nodes (16): Local Memo Search, F9 Guide, Backup Guide, Gimana Data Lo Dijaga (E2EE explainer), F10 Import & Export, JSON Export (plaintext with warning), Round-trip Test, Local Aggregation (once per range change) (+8 more)

### Community 3 - "Schedule, Calendar & Recurrence"
Cohesion: 0.16
Nodes (11): F1 Schedule, Recurrence rules (daily/weekly/monthly), Three-option edit/delete (this / this+following / all), Two time input modes (start-end / start+duration), F6 Calendar, Month render under 100ms for 500 events, Day/week/month views, T23 Capacitor native shell + PWA (+3 more)

### Community 4 - "Overview Analytics"
Cohesion: 0.20
Nodes (10): Habit Check-in, Habit Check-in History (heatmap data), Memo Mood (5-scale emoji), F11 Overview, Eisenhower Distribution, Overview Goal Progress Widget, Habit Heatmap, Mood Trend & Focus Correlation (+2 more)

### Community 5 - "Sticker & Delta Sync"
Cohesion: 0.29
Nodes (7): Import Flow (validate, preview, merge/replace), F14 Sticker, Bundled Sticker Packs (lazy load, offline), Page Decoration Mode (Hias) per screen size, Sticker Picker (stores ID only), Unknown Sticker ID Placeholder, Delta Sync (queue, LWW, tombstone, cursor)

### Community 6 - "Accounts, Auth & E2EE Sync"
Cohesion: 0.33
Nodes (3): T19 Server accounts, T20 E2EE crypto, T21 Sync engine

## Ambiguous Edges - Review These
- `T24 Sticker & decoration layer` → `T23 Capacitor native shell + PWA`  [AMBIGUOUS]
  docs/PRD/requirements.md · relation: conceptually_related_to

## Knowledge Gaps
- **30 isolated node(s):** `Out-of-scope list`, `Open questions (default)`, `Definition of Done`, `Three-option edit/delete (this / this+following / all)`, `Two time input modes (start-end / start+duration)` (+25 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 38 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `T24 Sticker & decoration layer` and `T23 Capacitor native shell + PWA`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `F13 Goals` connect `Habit, Memo & Home Widgets` to `Planning Core (Todo, Eisenhower, Pomodoro)`, `Schedule, Calendar & Recurrence`, `Overview Analytics`, `Sticker & Delta Sync`?**
  _High betweenness centrality (0.345) - this node is a cross-community bridge._
- **What connects `Out-of-scope list`, `Open questions (default)`, `Definition of Done` to the rest of the system?**
  _30 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Planning Core (Todo, Eisenhower, Pomodoro)` be split into smaller, more focused modules?**
  _Cohesion score 0.10144927536231885 - nodes in this community are weakly interconnected._
- **Why does `F11 Overview` connect `Overview Analytics` to `Planning Core (Todo, Eisenhower, Pomodoro)`, `Habit, Memo & Home Widgets`, `Guide, Import/Export & Local-first`?**
  _High betweenness centrality (0.270) - this node is a cross-community bridge._
- **Should `Habit, Memo & Home Widgets` be split into smaller, more focused modules?**
  _Cohesion score 0.13333333333333333 - nodes in this community are weakly interconnected._