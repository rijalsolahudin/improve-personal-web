> **Re-QA 2026-10-22:** F1 sudah diperbaiki dan diverifikasi - lihat `qa-rerun-f1.md`. Verdict Task #37 sekarang **LULUS**. Laporan di bawah adalah putaran gagal sebelumnya, disimpan sebagai riwayat.


# QA final check — Task #37 (PWA Nuxt) & #49 (orchestration skill)

Date: 2026-10-22 · Reviewer: Fajar (QA) · Build under test: `18ea58b` + working tree (uncommitted T23/T49 changes)
Rules read: `AGENTS.md`, `CLAUDE.md`, `.claude/rules/{shared-security,shared-code-quality,ergonio-status-flow}.md`, `apps/web/AGENTS.md`, `apps/web/CLAUDE.md`, `apps/web/.claude/rules/{security,performance,code-quality}.md`.

---

# Task #37 — [T23] PWA Nuxt: manifest, service worker, offline, adapter IndexedDB

## Verdict: **GAGAL (blocking)**

The manifest, the Workbox config and the offline page are all correct *as source*. But the built
artifact is **not functional**: the precache entry `offline` is fetched from `/offline`, and the
Nitro node-server answers **404** for that path. Workbox therefore aborts the install
(`bad-precaching-response`), the service worker goes `installing -> redundant`, and **nothing is
cached at all**. AC #1 (SW registered) and AC #2 (offline) fail in the production build.

Proof is not from reading config — it is from the built server + a real Chrome (CDP).

## Commands run (all from `apps/web`)

| Command | Result |
|---|---|
| `npx nuxt build` | exit **0** (`✨ Build complete!`, `.output` 7.63 MB / 2.05 MB gzip) |
| `npx nuxt typecheck` | exit **0** |
| `npx eslint nuxt.config.ts --max-warnings 0` | exit **0** |
| `npx prettier --check nuxt.config.ts public/offline.html` | `All matched files use Prettier code style!` |

## Requested artifact probes (actual output)

```
$ cat .output/public/manifest.webmanifest
{"name":"Improve Personal","short_name":"Improve Personal","start_url":"/app","display":"standalone",
 "background_color":"#F6EBDA","theme_color":"#F6EBDA","lang":"id","scope":"/",
 "icons":[{"src":"/icons/icon-192.svg","sizes":"192x192","type":"image/svg+xml"},
          {"src":"/icons/icon-512.svg","sizes":"512x512","type":"image/svg+xml"},
          {"src":"/icons/icon-maskable-512.svg","sizes":"512x512","type":"image/svg+xml","purpose":"maskable"}]}

$ grep -o 'PrecacheFallbackPlugin([^)]*)' .output/public/sw.js
PrecacheFallbackPlugin({fallbackURL:"/offline"})     # app-shell rule
PrecacheFallbackPlugin({fallbackURL:"/offline"})     # /login rule

$ grep -o 'navigateFallback[^,]*' .output/public/sw.js
(empty)                       # navigateFallback:'' -> workbox emits no fallback route
$ grep -c 'NavigationRoute' .output/public/sw.js
0
$ grep -o 'NetworkOnly' .output/public/sw.js | wc -l
3
$ grep -o '"offline"' .output/public/sw.js
"offline"                     # from url:"offline" — grep alone is NOT proof the URL is served
$ grep -o 'url:"[^"]*offline[^"]*"' .output/public/sw.js
url:"offline"
$ grep -c '_i18n' .output/public/sw.js
1
$ ls .output/public/offline.html .output/public/icons/
offline.html   icon-192.svg   icon-512.svg   icon-maskable-512.svg
```

## Findings

### F1 — HIGH (blocking): precache entry `offline` is 404 on the built server → service worker never activates

- **Where:** `apps/web/nuxt.config.ts:54` (`const OFFLINE_PAGE_URL = '/offline'`), `apps/web/public/offline.html`, `.output/public/sw.js` (`precacheAndRoute([{url:"offline",...}])`).
- **Repro (minimal):**
  1. `cd apps/web && npx nuxt build`
  2. `PORT=3799 node --env-file=.env .output/server/index.mjs`
  3. `curl -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3799/offline` → **404**
     `curl -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3799/offline.html` → 200
  4. Open `http://127.0.0.1:3799/app` in Chrome → DevTools ▸ Application ▸ Service workers:
     the worker goes `new → installing → redundant`. `navigator.serviceWorker.getRegistration()` → `undefined`, `caches.keys()` → `[]`.
- **Expected:** `/offline` serves the static offline HTML (200, `text/html`), precache installs 129 entries, SW reaches `activated`, offline navigation to `/login` renders "Kamu sedang offline".
- **Actual:** Nitro 404 (`{"statusCode":404,"statusMessage":"Page not found: /offline"}`) → workbox `if(!await e.cachePut(...)) throw new Error("bad-precaching-response")` (`.output/public/workbox-27f20b8e.js`) → install rejected → SW discarded → **no offline capability whatsoever**.
- **Evidence 1 — every precache entry probed against the built server** (`/tmp/verify_precache.py`, resolves each URL relative to `/sw.js`):

  ```
  precache entries: 129 | non-200: 1
    FAIL 404  entry='offline'  -> http://127.0.0.1:3799/offline
  ```

- **Evidence 2 — real Chrome / CDP**, SW lifecycle for `http://127.0.0.1:3799/`:

  ```
  ... status:"installing" ... status:"redundant" (runningStatus stopped)
  navigator.serviceWorker.getRegistration() -> undefined ; caches.keys() -> []
  ```

- **Evidence 3 — causal proof (controlled experiment).** Same build, behind a proxy that changes *only* `GET /offline -> /offline.html`:

  ```
  SW STATE: { registered: true, active: true, state: "activated" }
  caches: workbox-precache-v2 (129 entries), app-shell (/app), fonts (3)
  offline navigation /login -> title "Kamu sedang offline · Improve Personal", h1 "Kamu sedang offline"
  ```

  So the entire PWA machinery works; the single broken wiring is the missing `/offline` route.
- **Why it slipped:** `registerType:'autoUpdate'` + failure inside `install()` is **silent** — the `register()` promise still resolves, no console error for the app, no UI difference online. Only the built artifact can catch it (`devOptions.enabled:false`, so dev never runs the SW either).
- **Impact:** AC #37(1) service worker registered → **fail** functionally; AC #37(2) offline/precache/fallback → **fail** entirely; AC #37(3) is moot (no cache exists), though its config is correct (see F-note below).
- **Owner:** `dimas` (apps/web). Fix options (product code — out of QA scope):
  1. Serve the path: add `apps/web/server/routes/offline.get.ts` returning the static HTML as `text/html` (or a Nitro `routeRules` rewrite), **or**
  2. stop stripping `.html` (custom `manifestTransforms`) and use `OFFLINE_PAGE_URL = '/offline.html'` — more invasive; or
  3. rename the asset to `public/offline` — Nitro would then serve it with a wrong/ambiguous content-type.
  Recommendation: option 1 + a build guard (below).

### F2 — LOW: no `apple-touch-icon` (and no `apple-mobile-web-app-capable`)

- **Where:** `apps/web/nuxt.config.ts:104-110` (`app.head.link` has only `icon` + `manifest`); grep of `/`, `/app`, `/login` HTML → no `apple-touch-icon`.
- **Expected:** iOS "Add to Home Screen" uses `apple-touch-icon`; without it iOS synthesizes a thumbnail from the page.
- **Actual:** no link → iOS gets a screenshot icon.
- **Why this is Low, not a blocker:** on iOS, A2HS does **not** depend on the web manifest or the SW — it always works. So "installable" per AC #1 is not blocked; what degrades is the icon and (on iOS) the `display:standalone` treatment, which iOS takes from the `apple-mobile-web-app-*` meta tags. Needs a PNG (Safari does not use SVG for `apple-touch-icon`).
- **Repro:** open `/app` in Safari (iOS) → Share ▸ Add to Home Screen → icon is a page thumbnail.

### F3 — LOW: `sizes` on SVG icons is a raster target, not the real intrinsic size

- **Where:** `apps/web/nuxt.config.ts:194-201`; all three files declare `viewBox="0 0 512 512"` (`apps/web/public/icons/icon-192.svg:1`), yet the manifest says `192x192` for the 192 one.
- **Expected (spec-honest):** for scalable icons `sizes: "any"`.
- **Actual:** `192x192` / `512x512`. This is *achievable* (SVG scales) and it is what satisfies Chromium's 192 px install check, so it is a deliberate, common workaround — not a lie that breaks anything. Chrome's `Page.getInstallabilityErrors` → `[]`, `Page.getAppManifest.errors` → `[]`.
- **Caveat worth knowing:** the code comment (`nuxt.config.ts:191`) says "Chromium & Safari merasterisasi sendiri" — for Safari's A2HS that is not true (needs PNG `apple-touch-icon`, see F2).

### Notes on the other design decisions (checked, **consistent — not bugs**)

| Decision | Check | Result |
|---|---|---|
| `workbox.navigateFallback: ''` | `grep -c NavigationRoute .output/public/sw.js` | 0 — no fallback route hijacking deep links ✔ |
| `OFFLINE_PAGE_URL` ↔ precache key | precache key `offline`, `fallbackURL:"/offline"` | match (both resolve to `http://host/offline`) ✔ |
| `.html` stripped by `createManifestTransform` | `node_modules/@vite-pwa/nuxt/dist/shared/nuxt.9518178d.mjs:102-113` | confirmed `offline.html → offline` ✔ |
| `globPatterns` includes `_i18n/**/messages.json` + `svg` | precache entry `_i18n/c7d919af/id/messages.json`, 3 icons | ✔ |
| Fonts not precached | `grep '_fonts' sw.js` only matches the runtimeCaching regex; precache has no font | ✔ (3 fonts appear only in the `fonts` cache after use) |
| `registerType:'autoUpdate'` + `injectRegister:false` | no `serviceWorker` string in `/`, `/app`, `/login` HTML; registration comes from the injected Nuxt client plugin (`_nuxt/Dgi3EgKO.js` → `new Workbox('/sw.js',{scope:'/'})`) | ✔ |
| `devOptions.enabled:false` | `nuxt.config.ts:175` | ✔ |
| `start_url '/app'`, `scope '/'`, `display 'standalone'` | `manifest.webmanifest` | ✔ |
| `name`/`short_name` from `shared/brand.ts` | `BRAND.name = 'Improve Personal'`; no second brand literal | ✔ |
| `routeRules['/v1/**']` | `prerender:false`, `cache:false`, `cache-control: no-store`; runtime `GET /v1/{keys/envelopes,devices,sync/pull}` → 401 + `cache-control: no-store` | ✔ |
| CSP allows SW / manifest / icons | header CSP (`/app`) and `<meta>` CSP (`/`) both contain `worker-src 'self'`; no `manifest-src`/`default-src` → manifest unrestricted; `img-src 'self' data:` covers icons | ✔ |
| `offline.html` JS-free | no `<script>` in `.output/public/offline.html` | ✔ (CSP `script-src` with nonce would have blocked it) |
| API never cached | `runtimeCaching` order: `/^…\/(?:v1|api)(?:\/|$)/` NetworkOnly → `/\/api\//` NetworkOnly → `/app` NetworkFirst → `/login` NetworkOnly → `/_fonts/*.woff2` CacheFirst; no CacheFirst/SWR can match `/v1` or `/api`; live cache dump with active SW had 0 `/v1` keys | ✔ |

## AC results (#37)

| AC | Result | Evidence |
|---|---|---|
| 1. Installable: valid manifest, `<link rel="manifest">`, SW registered | **FAIL** | manifest ✔, link present on `/`, `/app`, `/login` ✔, Chrome parses manifest with 0 errors ✔ — but SW never leaves `installing` (F1) |
| 2. Offline: static assets + app shell precached, offline fallback actually served | **FAIL** | precache never installs; offline `/login` = browser error page. With F1 fixed: 129 entries + offline page verified working |
| 3. SW must not cache `/v1/**` and `/api/**` | **PASS (config), unverifiable at runtime until F1 is fixed** | NetworkOnly ×2 first in the list, no cache-matching handler for those paths; live cache dump (proxy run) had zero API URLs |

## Three pillars (#37)

- **Security:** no user data can reach Cache Storage (rule order + live cache dump). `/app` HTML is a true SPA shell — 7 250 B with `__NUXT__={}` + public config only, no per-user payload. CSP keeps `worker-src 'self'`.
- **Performance:** precache = 129 entries (JS/CSS/i18n/icons/manifest/offline). `_i18n` is 31.9 KB (statics, needed so the UI does not render raw keys offline). Fonts deliberately excluded from precache and only runtime-cached after use. Client cost of the register plugin: `_nuxt/Bd17z0YL.js` 5 653 B → 2 226 B gzip (lazy chunk).
- **Tidiness:** build/typecheck/eslint/prettier green; comments explain *why* (the `navigateFallback: ''` and font-budget notes are genuinely useful). The one thing comments do not cover is the runtime contract "`/offline` must be served", which is exactly what broke.

## Residual risks (#37)

1. **No guard on the precache contract.** Nothing in the pipeline verifies that precache URLs resolve. Suggested check (post-build, 15 lines): parse `precacheAndRoute([...])` from `.output/public/sw.js`, `fetch` each URL against the built server, fail on non-200. It would have caught F1 in seconds.
2. **Silent failure mode.** Because `autoUpdate` swallows install errors, any future precache mistake (renamed file, new glob) degrades to "no PWA" without a signal. Consider a `pwa:offline-ready` beacon or an e2e smoke test in CI (there is no CI workflow in the repo).
3. New page routes only get an offline fallback if a matching `runtimeCaching` rule is added (`/app/**` and `/login` only). Documented and accepted in the config, but easy to forget when `/register`-style routes are added later.
4. iOS is a second-class install today (F2/F3): SVG icons + no `apple-touch-icon`.
5. Not re-tested in this task: IndexedDB adapter, sync engine, real-device install prompt.

---

# Task #49 — Skill orchestration: fix for QA findings B1–B4

## Verdict: **LULUS**

All four findings are genuinely closed in the source of truth **and** in the generated `.qoder` copy,
and the sync is idempotent. No regression found in the parts that were changed.

## Per-finding verdict

| ID | Original finding | Verdict | Evidence (`path:line`) |
|---|---|---|---|
| B1 | Step 7 never mentioned the `review` transition | **CLOSED** | `.claude/skills/orchestration/SKILL.md:35` — "Pindahkan ke `review` saat mulai mengecek; lulus -> `done` + `progressPct: 100`; gagal -> `status-1792622168795` (Failed)". Matches `.claude/rules/ergonio-status-flow.md:38-44` and `.claude/agents/fajar.md:19-22`. |
| B2 | `packages/core/**` had no owner | **CLOSED** | Map: `.claude/skills/orchestration/SKILL.md:21` (`bayu` … `packages/core/src/**`). Agent scope: `.claude/agents/bayu.md:3` (description) and `.claude/agents/bayu.md:12`; mirrored in `.qoder/agents/bayu.md:3` and `:11`. |
| B3 | `progressPct` 90 / 100 not mentioned | **CLOSED** | `.claude/skills/orchestration/SKILL.md:34` (`status-1792622088574` + `progressPct: 90`), `:35` (`done` + `progressPct: 100`). Consistent with `ergonio-status-flow.md:29`, `:41`. |
| B4 | Dishonest subagent tool list | **CLOSED** | `.claude/skills/orchestration/SKILL.md:13` — "…Read, Glob, Grep, Bash, Write, dan `Edit` - kecuali `arif`/`yoga` yang tanpa `Edit`". Verified against frontmatter: `arif.md:4` and `yoga.md:4` = `Read, Glob, Grep, Bash, Write`; `bayu.md:4`, `dimas.md:4`, `raka.md:4`, `fajar.md:4` include `Edit`. |

## Commands run

| Command | Result |
|---|---|
| `md5sum .claude/skills/orchestration/SKILL.md .qoder/skills/orchestration/SKILL.md` | `8e59130a…` for **both** — identical |
| `grep -n 'review\|progressPct\|packages/core\|Edit' .claude/skills/orchestration/SKILL.md` | lines 13, 21, 32, 34, 35 (see table) |
| `grep -c '^model:' .qoder/agents/bayu.md` | **0** (`.claude/agents/bayu.md` → 1) |
| `pnpm check:agent-docs` | `check-agent-docs OK: 3 pilar + 3 rules sinkron` (exit 0) |
| `pnpm sync:qoder` ×2 + md5 of every file under `.qoder` before/after | no diff on either run → **idempotent**; `git status .qoder` unchanged (same 2 pre-existing modified files) |
| per-agent check: `.claude/agents/X.md` minus `^model:` vs `.qoder/agents/X.md` | **6/6 identical** (arif, bayu, dimas, fajar, raka, yoga) |

## New findings

### N1 — LOW: the agent map still leaves `packages/tokens/**` (and `packages/config/**`) unowned

- **Where:** `.claude/skills/orchestration/SKILL.md:18-25` lists `packages/contracts/src/**` and `packages/core/src/**`, but not `packages/tokens`.
- **Why it matters:** `packages/tokens` is real cross-app source (`packages/tokens/package.json` → `./src/index.ts`, `./dist/tokens.css`) consumed by web **and** mobile, and it is the natural home of the still-open T25 (theme/style tokens). When T25 is dispatched, the orchestrator has no owner for that path — the same operational gap B2 described, one package over.
- **Not a regression of B1–B4**, not blocking; suggestion: add `packages/tokens/src/**` (and `packages/config/**` if it is ever edited outside release chores) to a row, or state explicitly "shared — orchestrator decides per task".

## Residual risks (#49)

1. **No automated guard for the skill/roster.** `scripts/check-agent-docs.mjs` only enforces AGENTS.md ↔ CLAUDE.md and the app rules (by design, accepted). Skill/agent content is protected only by the pre-commit hook (`node scripts/check-agent-docs.mjs`, `node scripts/sync-qoder-config.mjs`, `git add .qoder`, `lint-staged`, `typecheck` in `.husky/pre-commit`) — there is **no CI workflow** in the repo, so a `--no-verify` commit or a direct push can introduce drift. The `.qoder` copies are consistent today (verified file-by-file), so this stays a risk, not a bug.
2. **Duplicated Ergonio rules.** The `progressPct` / transition wording now lives in three places (root rules, SKILL.md, each agent file). They agree today; nothing detects future divergence.

---

# Reproduce everything

```sh
# T37
cd apps/web && npx nuxt build && npx nuxt typecheck && npx eslint nuxt.config.ts --max-warnings 0
PORT=3799 node --env-file=.env .output/server/index.mjs &
curl -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3799/offline          # 404  <- F1
curl -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3799/offline.html     # 200
# then open http://127.0.0.1:3799/app in Chrome -> Application > Service workers: installing -> redundant

# T49
cd .. && md5sum .claude/skills/orchestration/SKILL.md .qoder/skills/orchestration/SKILL.md
pnpm check:agent-docs && pnpm sync:qoder && git status --porcelain .qoder
```
