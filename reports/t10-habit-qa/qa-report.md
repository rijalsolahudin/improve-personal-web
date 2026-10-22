# QA verification — Task #24 [T10] Habit: CRUD, check-in, streak

Date: 2026-10-22 · Reviewer: Fajar (QA) · Tree: `18ea58b` + uncommitted T10 working tree
Rules read: root `AGENTS.md`, `CLAUDE.md`, `.claude/rules/{shared-security,shared-code-quality,ergonio-status-flow}.md`,
`apps/web/AGENTS.md`, `apps/web/CLAUDE.md`, `apps/web/.claude/rules/{security,performance,code-quality}.md`.

Environment: Node `v24.18.0`, `vitest 5.0.3`, pnpm workspace. Host TZ is **Asia/Jakarta (offset −420)** even with `TZ` unset
(probe printed `TZ=(unset) offset=-420`); explicit TZ matrix was run on top of that.

---

## Verdict: **GAGAL (blocking)**

The migration itself is real: writes go through the encrypted repository, a tombstone is produced on delete, the outbox gets a
`put`/`delete` intent per write, and a global write queue serializes rapid clicks. Those claims are proven below.

But the new read/delete window is derived from `habit.createdAt`, and the UI lets the user backfill any past day. A check-in
written before `createdAt − 1 day` is stored but **never read back after reload**, and deleting the habit **leaves that row alive**
(no tombstone, no outbox delete) — exactly the "data yatim" the code comment says it avoids. On top of that, AC1 "arsipkan" has no
API and no UI at all, and `hydrate()` cannot retry after a locked/null session (new-device unlock shows an empty habit page until a
full reload). Verdict cannot be `done`.

---

## Commands run (all executed on this tree, exit codes recorded)

| # | Command (cwd) | Exit | Result |
|---|---|---|---|
| 1 | `npx vitest run app/composables/useHabits.test.ts app/utils/habits/persistence.test.ts app/utils/habits.test.ts` (`apps/web`) | **0** | 3 files, **25 tests passed** (7 + 8 + 10) |
| 2 | `npx eslint app/composables/useHabits.ts app/composables/useHabits.test.ts app/utils/habits.ts app/utils/habits/persistence.ts app/utils/habits/persistence.test.ts --max-warnings 0` (`apps/web`) | **0** | no output = clean |
| 3 | `npx nuxt typecheck` (`apps/web`) | **0** | silent, ~9 s. Gate proven non-vacuous: a temp file with `const x: number = "s"` made it exit **2 / TS2322**; file removed, exit 0 again |
| 4 | `npx vitest run` (`packages/core`) | **0** | 10 files, **182 tests passed** |
| 5 | `npx vitest run app` (`apps/web`, regression sweep) | **0** | 66 files, **544 tests passed** |

Probe files used for the evidence below were temporary (test-only) and have been deleted; `git status` now shows only the
developer's T10 changes. No product code was modified.

---

## Scope & test plan

**In scope / tested**

- CRUD path at composable + persistence level: `save`, edit, `remove`, `findHabit`, `toggleDay`, `toggleToday`, `streakOf`.
- UI→core mapping: `sticker ?? icon` → `iconSticker`, `days` JS weekday → `frequencyDays` (senin/rabu/jumat), `target` → `targetPerDay`.
- Real persistence: `openLocalDataSession` + `fake-indexeddb` + **real libsodium**, reopen session, raw record inspection.
- At-rest encryption, tombstones, outbox intents, index-based range reads (instrumented `openRecord` counter + captured `queryByRange` args).
- Day boundary: local midnight (`rangeStartMs`), 00:05 local, cross-midnight; TZ matrix UTC / Asia/Jakarta / America/New_York / Pacific/Kiritimati.
- Races: two `toggleToday()` and three `toggleDay()` with no `await`, sealed-plaintext order check `[1,2,3]`.
- Fault injection: `writer.write` throws; null session then session becomes available.
- Perf order of magnitude: 1,825 and 5,475 check-in rows.

**Out of scope / not tested (with reason)**

- Real-browser E2E (Playwright + real IndexedDB/libsodium, real auth): no dev server/auth fixture in this task; UI wiring was
  verified by code reading plus unit-level probes. This is called out as residual risk.
- Actual sync upload/merge: T10's AC only requires outbox recording; no sync endpoint involved.
- Multi-account switching, mobile app, archive (feature absent).

---

## Acceptance criteria

| AC | Status | Evidence |
|---|---|---|
| 1. CRUD: create, edit, archive, delete | **FAIL (partial)** | create/edit/delete pass (`useHabits.test.ts:103`, `:118`; probes). **Archive does not exist**: no `archived` field in `Habit` (`utils/habits.ts:79-92`), no archive member in the composable return (`useHabits.ts:200-214`), no habit archive UI (grep `arsip\|archive\|isArchived` only hits Countdown). `isArchived` is merely preserved on overwrite (`persistence.ts:81`). |
| 2. Check-in accumulates to target, multiple per day | **PASS (normal flow)** | 3 clicks → amounts `1,2,3` sealed in order, final row `amount=3`; 4th click → `0` → record tombstoned. `nextCount` (`utils/habits.ts:141-144`), `persistCheckin` (`persistence.ts:229-240`). Edge: backfilled days before `createdAt−1` are lost on reload — see F1. |
| 3. Streak ignores non-scheduled days; daily vs weekly_days | **PASS** | Persisted-data probe: Mon/Wed/Fri habit with 7 check-ins (05,07,09,12,14,16,19 Oct) → `streakOf = 7`; daily habit with the same 7 days → `1`. Weekday mapping proven: `days:[1,3,5]` → core `['senin','rabu','jumat']` and back to `[1,3,5]`. |
| 4. Persisted through repository (remount) + outbox | **PASS with caveat** | Remount with fresh Nuxt state reloads habit + check-ins from storage (`status='ready'`). Raw blob has no plaintext. Outbox: 2 `put` rows after habit+check-in; after delete `put, delete, delete, put`. Caveat: the read window hides pre-creation check-ins (F1) and delete misses them (F2). |
| 5. No API/behavior regression for UI consumers | **PASS (structurally)** | Old return keys (`git show HEAD:...`) are all still present; new keys are additive (`status`, `error`, `hydrate`). `npx nuxt typecheck` + full app suite (544) green. Behavior of the consumers themselves is not covered by tests — see "Coverage gaps". |

---

## Findings

| # | Severity | Where | Summary |
|---|---|---|---|
| F1 | **High** | `apps/web/app/utils/habits/persistence.ts:141-149` | Check-in written before `habit.createdAt − 1 day` is in the DB but never read back → disappears after reload |
| F2 | **Medium** | `apps/web/app/utils/habits/persistence.ts:192-194` | Deleting a habit leaves those same check-ins alive (no tombstone, no outbox `delete`) — contradicts "Riwayat ikut hilang" |
| F3 | **Medium** | `apps/web/app/utils/habits.ts:79-92`, `apps/web/app/composables/useHabits.ts:200-214` | AC1 "arsipkan" not implemented (no API, no UI); `isArchived` only preserved |
| F4 | **Medium** | `apps/web/app/composables/useHabits.ts:50,93,99` | `hydrate()` can never retry after a null session (locked/new-device unlock → empty page until full reload) |
| F5 | **Medium** | `apps/web/app/composables/useHabits.ts:104-106` | Hydrate overwrites state written while it was in flight (habit vanishes from UI, persisted in DB) |
| F6 | **Medium** | `apps/web/app/composables/useHabits.ts:126-138` | Write failures only land in `status`/`error`, which no consumer reads; form closes as if saved |
| F7 | **Low** | `apps/web/app/utils/habits/persistence.ts:141,148` | Hydrate has no full-table scan (pass) but decrypts unbounded history on every open — linear growth |

### F1 — High — Backfilled check-in is silently lost after reload

**Repro**

1. Create a daily habit today (probe date 2026-10-19), target 1.
2. On the Habit page click `‹` to the previous month (`apps/web/app/pages/app/habit.vue:46`).
3. Click cell **2026-10-12** — grid only disables future days (`HabitGrid.vue:162,166`), so past days before the habit existed are clickable.
4. Cell shows `1`; the row is written (`habit_checkin`, `localDate=2026-10-12`, `deleted:false`).
5. Reload / open a new session.

**Expected:** the check-in is still shown (the record exists and is not deleted).
**Actual:** `checkIns[habitId]` is `{}`; `status='ready'`, no error. The record stays in IndexedDB but is outside the hydrate window.

**Proof:** probe with the same flow asserted `expect(loaded.checkIns).toEqual({})` after `listAll({includeDeleted:false})` returned
1 row. Instrumented provider: 4 `habit_checkin` rows, only the 2 inside `[createdAt−1d, now+1d]` were opened (`openRecord` = 3
including the habit). Window source: `earliestDayStart` at `persistence.ts:141`, `fromMs = earliestDayStart − MS_PER_DAY` at `:148`.

**Impact:** silent data loss in a flow the UI explicitly offers; AC2/AC4. A habit tracker is commonly started *after* the fact.

### F2 — Medium — Delete leaves live check-ins outside the window (no outbox delete)

**Repro**

1. Same backfill as F1 (check-in on 2026-10-12, habit created 2026-10-19).
2. Delete the habit via the form (delete → confirm, `HabitForm.vue:63-67`).

**Expected:** zero live `habit_checkin` rows for that habit and one outbox `delete` per check-in record ("Riwayat ikut hilang",
`persistence.ts:182-186`).
**Actual:** the 2026-10-12 row remains `deleted:false`; outbox only receives deletes for the habit and the in-window check-in.

**Proof:** probe failed exactly here (`expected []`, got 1 live row). Outbox after delete: `put, delete, delete, put`
(2 writes before, 2 deletes after). The sweep uses the same `createdAt`-based range at `persistence.ts:192-194`.

**Impact:** privacy/data-retention: history the user asked to delete remains locally (encrypted) and will never be sent as a
delete to sync. The docstring says the opposite ("SELURUH riwayat", "lebih jujur daripada … data yatim").

### F3 — Medium — AC1 "arsipkan" is absent

**Repro:** open Habit page → there is no archive action anywhere; `HabitForm` offers only save and delete (`HabitForm.vue:55-67`).
**Expected:** archive/unarchive that persists and removes the habit from the active list.
**Actual:** no `archived` field in the UI type, no composable method, no UI. `isArchived` exists in the core schema and is preserved
(`persistence.ts:81`) but nothing ever sets it to `true`.

**Note:** this is a pre-existing product gap, not a regression caused by the persistence migration — but it is an explicit T10
acceptance criterion, so it blocks "AC met".

### F4 — Medium — `hydrate()` cannot retry after a null session

**Repro**

1. Open the app on a device that does not hold the local key (new browser / cleared site data). The dashboard renders the page
   under the recovery gate (`layouts/dashboard.vue:29,34`), so the Habit page mounts and calls `hydrate()`.
2. `useLocalData.ensure()` returns `null` while locked (`useLocalData.ts:76-89`).
3. Unlock with passkey or recovery code. `useKeyRecovery.reopen()` only calls `ensure()` + `account.load()` — no reload
   (`useKeyRecovery.ts:66-69`).

**Expected:** habit list loads after unlock.
**Actual:** list stays empty, `status='idle'`, no error, until a full page reload. `hydrateInFlight` is set at `useHabits.ts:93` and
never cleared on the null path (`:99`); the next `hydrate()` returns the cached, already-resolved promise (`:116`). Opening the form
(`HabitForm` mounts and calls `useHabits()` again) does not help either.

**Proof:** probe: session `null` on first `hydrate()`, then session available; second `hydrate()` → `expected 'idle' to be 'ready'`.

### F5 — Medium — Writes during hydrate are overwritten in state

**Repro:** mount the page and save a habit before the initial `hydrate()` resolves (slow device or large history; measured hydrate
cost in F7).
**Expected:** the new habit is visible.
**Actual:** `habits.value = loaded.habits` (`useHabits.ts:104`) replaces the optimistic state; the habit disappears from the UI even
though it is persisted (it comes back after reload). Probe: `findHabit(id)` after hydrate → `expected undefined to be defined`.
**Likelihood:** low on a fast desktop, grows with history size / low-end mobile. Fix is cheap (merge, or block writes until ready).

### F6 — Medium — Write failures are invisible to the user

**Repro:** make `session.writer.write` throw (storage quota exceeded / private mode), then create a habit.
**Expected:** user is told the save failed; state does not pretend it succeeded.
**Actual:** `background()` catch sets `status='error'` + `error` message (`useHabits.ts:112,126-138`), but **no consumer reads
`status` or `error`** (grep: only tests). `HabitForm.submit()` closes on `{id}` (`HabitForm.vue:55-58`), the habit stays in the
list, the DB is empty, and it vanishes on reload. Probe confirmed: state contains the habit, storage `listAll` is `[]`,
`status='error'`.

### F7 — Low — Hydrate decrypts unbounded history (no full scan)

**Pass on the claim:** `loadCheckIns` uses `listByRange` (`persistence.ts:118-121`) with the `rangeStartMs` index written at
`:238`; `queryByRange` refuses a query without type/range. Instrumented run: 4 check-in rows, only the 2 in-window rows decrypted.

**Concern:** the window starts at the *oldest habit's* `createdAt` (`:141,148`) with no lower bound, so every app open decrypts the
entire history. Measured (node, `fake-indexeddb` + real libsodium): 1,825 rows → **29.9 ms**; 5,475 rows (3 habits × 5 years) →
**93.7 ms**, ~17 µs/row, linear. Acceptable today; grows forever. Note: any bound must be consistent with the F1 fix.

---

## Developer-acknowledged gaps — status

| Gap | Real? | Severity | Evidence |
|---|---|---|---|
| (a) `color` and `goalId` not in core schema → reset after reload | **Yes** | **Medium** | `persistence.ts:98` (`color: DEFAULT_HABIT_COLOR`), `:104` (`goalId: null`). Probe: save `color:5, goalId:<uuid>` → after reload `color:0, goalId:null`. User-visible: the form has color swatches and goal chips. Needs a core schema change (bayu) + mapping (dimas). |
| (b) Icon lost when a sticker is chosen | **Yes** | **Low** | Single core field `iconSticker` (`persistence.ts:74`); `fromCoreHabit` falls back to `{icon:'star', sticker:<value>}`. Probe: `icon:'heart' + sticker` → after reload `icon:'star'`; clearing the sticker later keeps `'star'`, so the user's icon choice is permanently lost. Cosmetic only. |
| (c) Check-in retention limited by habit `createdAt` | **Yes** | **High** | Two manifestations: unreadable after reload (F1) and orphan on delete (F2). `persistence.ts:141-149` (read), `:192-194` (delete). |

---

## Three pillars

- **Security — pass, with one retention caveat.** Habit/check-in names are not in the blob: `blobLen=420`, base64 ciphertext,
  `hasPlaintext=false`, and base64-decoding the blob does not reveal the name either. Tombstoned rows keep ciphertext. Repository
  `getById` returns `null` for tombstones (`repository.ts:64`). Outbox rows carry only `recordId/op/queuedAtMs/attempts`
  (`packages/core/src/ports.ts:212-220`) — no plaintext. Secrets stay in module scope, not `useState` (`useLocalData.ts:12-19`).
  Caveat: F2 keeps deleted history alive.
- **Performance — pass on "no full scan", watch the unbounded window.** Index range query, batched open, no N+1. Numbers in F7.
- **Code quality — pass.** eslint 0 warnings; typecheck 0; no `.only`/`.skip`/`any`/`@ts-ignore`/`console` in the five changed
  files; JSDoc explains invariants; module-level state has a test reset hook (`resetHabitsHydrationForTest`). Two logic gaps are
  the `hydrateInFlight` reset (F4) and the unused error path (F6).

---

## Coverage & remaining test gaps

- Developer tests: 25 cases, all green. They cover happy-path persistence, encryption, one-row-per-day, range read, delete
  tombstone (with in-window check-ins only), remount, and the "no session = idle" path. No coverage provider is configured in
  `apps/web` (no `coverage` entry in `package.json`), so no percentage is claimed.
- Not covered by any test: backfill before `createdAt` (F1), delete sweep outside the window (F2), hydrate retry (F4), write during
  hydrate (F5), write failure surfacing (F6), archive (absent), and the whole UI wiring.
- Consumers and their protection:
  - `components/features/habit/HabitForm.vue:21` — **no component test**
  - `components/features/habit/HabitGrid.vue:19` — **no component test** (this is where the F1 flow is reachable)
  - `pages/app/habit.vue:10` — **no page test**
  - `composables/useOverview.ts:42` — **no test file**
  - `composables/usePomodoroTargets.ts:22` — **no test file**
  - `composables/useDailyRoutine.ts:145` — has `useDailyRoutine.test.ts`, but it only clears the `habits` state; it never asserts
    habit behavior.
  So AC5 is supported by typecheck + unchanged keys, not by behavioral tests of the consumers.

---

## Residual risks

1. **No component/E2E coverage of the habit UI.** Month navigation, backfill click, delete confirmation and error display are
   verified by reading code, not by automation. F1 slipped through exactly because of this.
2. **Reviving a tombstoned id resets `createdAt` and `isArchived`** (`persistence.ts:76-82`; probe confirmed). Not reachable from
   today's UI, but relevant for restore/sync merge.
3. **Streak lookback is capped at 400 days** (`utils/habits.ts:77,116`) — pre-existing, so a 400+ day streak is truncated.
4. **Timezone travel / DST-at-midnight** is not covered (matrix: Asia/Jakarta, UTC, America/New_York, Pacific/Kiritimati; no
   midnight-DST zone). `localDate` is authoritative on read, so the risk is low.
5. **Outbox only accumulates** in this scope; no sync run was verified, so delete intents currently have no consumer.
6. **Hydrate cost grows linearly with history** (F7) and there is no pagination/window bound.

---

## Recommendations (ordered)

1. **Fix F1/F2 together.** Do not derive read/delete bounds from `createdAt`. Either (a) disable grid cells before the habit's
   creation date *and* delete check-ins by `habitId` (dedicated index) instead of by date range, or (b) keep a per-habit low-water
   mark / fixed retention window and use it consistently for read and delete. The delete sweep must cover **all** rows of the habit.
2. **F4:** clear `hydrateInFlight` on the null-session path (`useHabits.ts:99`) and trigger `hydrate()` after unlock (e.g. watch
   `localData.status`, or call it from the recovery gate).
3. **F5:** merge hydrate results with writes made while loading, or gate writes on `status === 'ready'`.
4. **F6:** surface `status`/`error` in the Habit page (banner/toast) and roll back the optimistic habit on failure.
5. **F3:** implement archive — core already has `isArchived`; needs a composable method, a list filter, and a UI action.
6. **Add regression tests** (these were the probes that failed; they should become permanent):
   - backfilled check-in before `createdAt` survives reload;
   - delete removes all check-ins incl. pre-creation, with one outbox `delete` per record;
   - `hydrate()` retries after a null session;
   - `save()` during hydrate is not overwritten;
   - failed write is surfaced / state rolled back.

Ownership: F1-F6 are web (`dimas`); gaps (a)/(b) need a core schema change (`bayu`) before the web mapping can persist them.

