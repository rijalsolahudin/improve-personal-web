# QA re-run — Task #37 [T23] PWA Nuxt (F1 fix verification)

Date: 2026-10-22 · Reviewer: Fajar (QA) · Build under test: `18ea58b` + working tree (T23 uncommitted)
Rules read: `AGENTS.md`, `CLAUDE.md`, `.claude/rules/{shared-security,shared-code-quality,ergonio-status-flow}.md`, `apps/web/AGENTS.md`, `apps/web/CLAUDE.md`, `apps/web/.claude/rules/{security,performance,code-quality}.md`.
Method: everything below was executed on a clean `pnpm build` of this tree and against the built Nitro server + a real Chrome (CDP). Nothing is taken from the developer's claims or from reading config alone.

---

## Verdict: **LULUS**

F1 is genuinely closed: the built artifact serves `/offline` with `200 text/html`, Workbox installs all **129** precache entries, the SW reaches `activated`, and offline navigation to `/login` renders "Kamu sedang offline" **from Cache Storage** with **0 `<script>` tags**. No blocking finding. Four Low/informational notes + residual risks at the end; none of them requires a code change to ship this task.

---

## Commands run (all from `apps/web`, actually executed)

| Command | Exit | Output (verbatim / trimmed) |
|---|---|---|
| `pnpm build` | **0** | `✨ Build complete!` … `verify-precache OK: 129 entri precache semuanya bisa dilayani` (`.output` 7.63 MB / 2.05 MB gzip) |
| `node scripts/verify-precache.mjs` | **0** | `verify-precache OK: 129 entri precache semuanya bisa dilayani` |
| `npx nuxt typecheck` | **0** | no output |
| `npx eslint nuxt.config.ts scripts/verify-precache.mjs --max-warnings 0` | **0** | no output |
| `npx eslint . --max-warnings 0` (whole app, extra) | **0** | no output |
| `npx prettier --check nuxt.config.ts package.json scripts/verify-precache.mjs public/offline/index.html` | **0** | `All matched files use Prettier code style!` |

## Artifact probes (the requested checks)

```
$ ls .output/public/offline/
index.html                      # 6288 B
$ ls .output/public/offline.html
ls: cannot access '.output/public/offline.html': No such file or directory
$ grep -o 'url:"[^"]*offline[^"]*"' .output/public/sw.js
url:"offline"                   # exactly 1 occurrence
$ grep -c NavigationRoute .output/public/sw.js
0
$ grep -o 'fallbackURL:[^,}]*' .output/public/sw.js
fallbackURL:"/offline"          # x2 (app-shell rule + /login rule) — resolves to the same URL as the precache key
$ grep -o 'url:"[^"]*"' .output/public/sw.js | wc -l
129
$ grep -o 'url:"[^"]*_i18n[^"]*"' .output/public/sw.js
url:"_i18n/c7d919af/id/messages.json"
```

Handler inventory in the generated SW (`registerRoute` order preserved):
`v1|api → NetworkOnly`, `/api/ → NetworkOnly`, `/app → NetworkFirst`, `/login → NetworkOnly + PrecacheFallback`, `/_fonts/*.woff2 → CacheFirst`. **No `StaleWhileRevalidate` anywhere**; the only cache-matching handler is fonts, whose file names are content hashes.

## Live server probes (built server, `PORT=3799`)

```
GET /offline               => 200  text/html; charset=utf-8  6288B
GET /offline/              => 200  text/html; charset=utf-8
GET /offline.html          => 404  application/json
GET /manifest.webmanifest  => 200  application/manifest+json
GET /sw.js                 => 200  text/javascript; charset=utf-8
GET /login                 => 200  text/html;charset=utf-8
GET /                      => 200  text/html;charset=utf-8
GET /app                   => 200  text/html;charset=utf-8
```

Independent cross-check (not using the new guard): parse `precacheAndRoute([...])` from `.output/public/sw.js` and HTTP-fetch **every** URL against the running server:

```
precache entries: 129
non-200: 0
```

## Runtime probes — real Chrome via CDP (fresh profile, `http://localhost:3799`)

| Probe | Result |
|---|---|
| SW lifecycle | `registration.active.state = "activated"`, scope `http://localhost:3799/`, `scriptURL …/sw.js`, `navigator.serviceWorker.controller` present after 1 reload |
| Cache Storage | `["workbox-precache-v2-http://localhost:3799/", "fonts"]`; precache **129** entries; `fonts` 3 entries (only after real use) |
| `cache.match('/offline', { ignoreSearch: true })` | **HIT** `200 text/html; charset=utf-8`, `<title>Kamu sedang offline · Improve Personal</title>`, **0** `<script` |
| Stored key shape | `http://localhost:3799/offline?__WB_REVISION__=ed5c68…` — and `cache.match('/offline')` **without** `ignoreSearch` = `false`, so the `ignoreSearch` detail from the previous report is still accurate (Workbox behaviour, not a bug) |
| API caching | After firing `GET /v1`, `/v1/keys/envelopes` (401), `/v1/sync/pull` (401), `/api/health` (404) from the page: `apiUrls: []` — **no** `/v1/` or `/api/` key in any cache |
| **Offline `/login`** (server SIGTERM'd, port confirmed free, direct curl → connection refused) | Page title `Kamu sedang offline · Improve Personal`, `h1` "Kamu sedang offline", `scriptCount: 0`, `browserErrorPage: false` |
| Offline `/app` (app-shell warm) | Serves the cached SPA shell (`app-shell` key `http://localhost:3799/app`), loads precached chunk `BoGNwisN.js`, 4 `<script>`, `#__nuxt` innerHTML 4088 chars, then client-routes to `/login?redirect=/app` — **no** browser error page |
| Console | Only expected app noise (401 from the API probe, `net::ERR_CONNECTION_REFUSED` after the kill). **No** `bad-precaching-response`, no `redundant` |

Note on one number that looks wrong at first glance: after killing the server, an in-page `fetch('/login')` still returned `200`. That is the **service worker serving the precache fallback**, not a live server — proven by `lsof` showing port 3799 free and by the console entry `net::ERR_CONNECTION_REFUSED` for the actual network attempt.

## Guard self-test — does `verify-precache.mjs` really catch this bug class?

Run on throwaway **copies** of `.output` (real `.output` never modified):

| Simulation | Exit | Message |
|---|---|---|
| **A. Exact old F1 layout**: `offline.html` present, `offline/index.html` removed | **1** | `verify-precache GAGAL: 1/129 entri tidak bisa dilayani` → `- url:"offline" -> tidak ada (dicoba: offline, offline/index.html)` |
| **B.** Offline page file deleted entirely | **1** | same message, `1/129` |
| **C.** Unmodified copy (positive control) | **0** | `verify-precache OK: 129 entri precache semuanya bisa dilayani` |
| **D.** No `.output` at all | **1** | `verify-precache: …/.output/public/sw.js tidak ada - jalankan \`nuxt build\` dulu` — clear message, **no stack trace** |
| **E.** One `_nuxt` chunk deleted (general class, not just offline) | **1** | `- url:"_nuxt/zyyYvwaj.js" -> tidak ada` |
| F. Does `&&` actually gate the build? `sh -c 'node verify-precache.mjs && echo NEXT'` on case A | **1**, `NEXT` never printed | yes — a guard failure fails `pnpm build` |

Precision is good: only the offending entry is reported (`1/129`), so the message points straight at the broken wiring.

## Findings

| # | Severity | Finding | Blocking? |
|---|---|---|---|
| N1 | Low | The guard validates the **filesystem**, not the **served response** — it would pass if `/offline` were shadowed by a server route, a rewrite, or served with the wrong content type | No (documented risk; see recommendation) |
| N2 | Low | The guard only runs through `pnpm build`. A direct `npx nuxt build` bypasses it, and the repo has **no CI** and no build step in `.husky/pre-commit` | No |
| N3 | Low | `/offline` is served **without a CSP header** (nuxt-security headers apply to rendered responses, not static assets). Page is JS-free and fully static, so there is no injection path today | No |
| N4 | Info | `app-shell` caching for an **authenticated** user is unverified: `/app` needs a real session (OTP + DB), and an unauthenticated visitor is redirected to `/login`, so the shell entry never gets created in that flow | No — the fallback path was verified |

Details:

### N1 — Low: guard checks existence, not servability
- **Where:** `apps/web/scripts/verify-precache.mjs:50-67` (`candidatesOf` + `isFile`).
- **Repro:** copy `.output`, add `apps/web/server/routes/offline.get.ts` returning `createError({ statusCode: 404 })` (do **not** do this in the repo), rebuild → `verify-precache OK` while `/offline` answers 404.
- **Expected:** a build guard for a runtime contract should observe the runtime. **Actual:** it observes the output tree.
- **Why it is acceptable now:** the file→URL mapping of Nitro's static handler is stable and documented in the comment (`nuxt.config.ts:44-59`); the previous bug was exactly a file-layout mistake, which is caught (case A). Residual exposure is "someone re-introduces server-side routing on `/offline`".
- **Recommendation (next task, not blocking):** add a smoke step that boots `.output/server/index.mjs` on an ephemeral port and asserts `GET /offline` → 200 + `text/html` + contains "Kamu sedang offline". ~30 lines, same script location. Or a Playwright e2e once the dependency is justified.

### N2 — Low: guard invocation is not enforced
- **Where:** `apps/web/package.json:7` (`build = nuxt build && node scripts/verify-precache.mjs`), `package.json:10` (`verify:precache`); root `package.json` `build` → `turbo run build` (so the normal path does run it).
- **Repro:** `cd apps/web && npx nuxt build` → guard never runs; break `public/offline` → still exit 0.
- **Expected:** any production build is guarded. **Actual:** only `pnpm build` / `turbo run build`. No `.github/workflows`, and `.husky/pre-commit` runs agent-doc checks + lint-staged + typecheck, no build.
- **Impact:** the guard protects disciplined developers, not the pipeline. Note the previous QA report already flags "no CI" as an existing gap — this finding inherits it, it does not create it.

### N3 — Low: no CSP on the static offline page
- **Where:** `apps/web/public/offline/index.html` (3 inline `<style>` blocks, 0 scripts); response headers for `GET /offline` contain HSTS / `X-Content-Type-Options: nosniff` / `Referrer-Policy` / `X-Frame-Options` but **no `Content-Security-Policy`**.
- **Expected per `security.md` §6:** CSP on HTML documents. **Actual:** static assets bypass `nuxt-security`.
- **Why Low:** the document is a build artifact with no user input, no scripts, no external references (`img-src` needs nothing, SVG is inline). There is nothing for an injected CSP to protect. Options if the team wants consistency: add a `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">` (note: `unsafe-inline` is required for the inline `<style>`, which is why a nonce is impossible in a static file).

### N4 — Info: authenticated app-shell path not exercised
- **Repro:** open `/app` unauthenticated → client redirect to `/login`; `app-shell` cache stays empty; offline `/app/to-do` → offline page (correct, and not an error screen).
- **What was proven instead:** warming the rule with a real same-origin `GET /app` (200, 7250 B, contains `__NUXT__`) puts `http://localhost:3799/app` into `app-shell`; offline navigation to `/app` then serves that shell + precached JS and the SPA boots. So the chain shell → precache chunk → render works offline.
- **Gap:** a truly authenticated offline session (IndexedDB unlock, sync queue) is out of scope for T23 and untested here.

## Status of the previous findings

| ID | Previous severity | Status now | Evidence |
|---|---|---|---|
| **F1** | High (blocking) | **CLOSED** | `public/offline/index.html` → `.output/public/offline/index.html` (6288 B); `GET /offline` 200 `text/html`; 129/129 precache URLs 200; SW `activated`; `caches.keys()` = `workbox-precache-v2…` (129) + `fonts`; offline `/login` renders the offline page with 0 scripts |
| **F2** | Low (accepted risk) | **STILL OPEN — accepted** | `grep apple-touch-icon .output/public/index.html` → none. The config comment (`nuxt.config.ts:196-201`) now states the iOS limitation explicitly instead of claiming Safari rasterises the manifest icon, so the *documentation* half of F2 is addressed |
| **F3** | Low (accepted risk) | **STILL OPEN — accepted** | Manifest still declares `sizes: 192x192/512x512` for SVG icons; comment now says `sizes` on SVG is a raster target, not the intrinsic size |

## Three-pillar check

- **Security** — `/v1` and `/api` are `NetworkOnly`, listed **before** any cache-matching rule; live cache dump after probing 4 API URLs contained **0** API keys. `sw.js` order: `v1|api → /api/ → /app → /login → _fonts`. No `SWR`/`CacheFirst` can reach API traffic. `/app` HTML is the SPA shell only (`__NUXT__` = public config), consistent with `security.md` §2. The offline page is static, JS-free, contains no data. Caveat: no CSP on that document (N3). Full `eslint .` clean; `console.*` still stripped in production build (`$production.vite.build` unchanged).
- **Performance** — precache is still exactly **129** entries (no growth from the fix; `offline.html` → `offline/index.html` is 1:1). Offline page 6288 B, 0 JS. i18n messages still precached (`_i18n/c7d919af/id/messages.json`), so the UI does not render raw keys offline. Fonts still excluded from precache and lazy-cached. The added build step is a 129-stat loop (~0.2 s), no runtime cost. No budget item touched by this change.
- **Tidiness** — `nuxt.config.ts` comment block (`:44-59`) explains *why* the directory shape is mandatory and names the exact failure mode, with the guard referenced. Comments on `OFFLINE_PAGE_URL`, `navigateFallback: ''`, and the icons are honest about trade-offs. No dead code, no TODO, no `eslint-disable`. `prettier --check` and `eslint --max-warnings 0` green, including the new script. No leftover reference to `public/offline.html` outside explanatory comments and the historical report.

## Scope / what was NOT tested

| Not tested | Why |
|---|---|
| `vitest run` (unit) | No unit test touches `nuxt.config.ts`, `public/**` or `scripts/**`; the only test-looking matches (`useAuthSession`, `useLogout`, storage) are unrelated. The working tree also carries another task's changes (`useHabits*`, `app/utils/habits/`), whose suite result would be noise in this verdict |
| Authenticated offline session (IndexedDB unlock, sync) | Needs a real account + OTP + DB; out of T23 scope (N4) |
| Real iOS/Android install prompt | No device; F2/F3 already accepted |
| Lighthouse / CWV | No runtime/CSS/JS payload change in this fix; not re-run |
| Production host (proxy, CDN) | Only the Nitro node-server preset is in scope here |

## Residual risks (ranked)

1. **No CI** — the guard and the build contract are enforced by convention. Anything that bypasses `pnpm build` (direct `nuxi build`, `--no-verify`, manual deploy) rebuilds the F1 class of bug silently.
2. **The guard cannot see the response** (N1). If `/offline` is ever shadowed by a server route or served as `application/octet-stream`, the guard still says OK while the SW breaks. A 30-line "boot the server and curl `/offline`" check closes this.
3. **Silent failure mode is unchanged** — `registerType: 'autoUpdate'` resolves the registration promise even when `install` fails. Any future precache mistake degrades to "no PWA" with no user-visible signal until someone inspects Cache Storage.
4. **Offline coverage is per-route** — only `/login` and `/app/**` have `precacheFallback`. A new top-level page (e.g. `/register`) will show the browser error page offline until a rule is added. Documented in the config, easy to forget.
5. **iOS is still second class** (F2/F3) — icon is a page thumbnail on A2HS; a PNG `apple-touch-icon` is the only fix and it is accepted as out of scope.
6. **`/offline.html` is now 404** — intended, and nothing in the repo references it; but any external bookmark/link to the old path breaks (no evidence such links exist).

## Recommendation

Ship T23 (`done`, `progressPct: 100`). Open a **Low** follow-up for N1+N2 combined ("promote the precache check to a served-response smoke test in CI"), and keep F2/F3 on the accepted-risk list.

---

## Coverage per acceptance criterion (#37)

| AC | Result | Evidence |
|---|---|---|
| 1. Installable: valid manifest, `<link rel="manifest">`, SW registered | **PASS** | `manifest.webmanifest` 200 `application/manifest+json`, 3 icons, `start_url /app`, `scope /`, `display standalone`; `<link rel="manifest">` present in built HTML; SW `activated` and controlling |
| 2. Offline: static + shell precached, fallback actually served | **PASS** | 129/129 precache entries 200 from the live server; `cache.match('/offline', {ignoreSearch:true})` → 200 `text/html`; offline `/login` → "Kamu sedang offline", 0 scripts, no browser error page; offline `/app` → cached shell + precached chunk, SPA boots |
| 3. SW must not cache `/v1/**` and `/api/**` | **PASS** | rule order in `sw.js`; live dump after 4 API probes: 0 API URLs in Cache Storage |
