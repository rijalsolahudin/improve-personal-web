# Improve Personal — Design System

Personal productivity web app (Bahasa Indonesia, casual) that unifies goals, schedule, to-do, Eisenhower, Pomodoro, countdowns, habits and a daily memo + mood journal. Single user, responsive web (desktop + mobile).

**Sources:** derived from this project's own designs — `Home Desktop.dc.html`, `Home Mobile.dc.html`, `Mascot.dc.html`, `Sticker.dc.html` / `sticker-lib.js` — and `uploads/PRD.md` (product spec). No Figma or codebase.

## Index
- `styles.css` — entry point (imports only) → `tokens/{fonts,colors,typography,shape,spacing,patterns}.css`
- `guidelines/` — foundation specimen cards (colors, type, shape, spacing, brand)
- `components/` — React primitives (`.jsx` + `.d.ts` + `.prompt.md`), one preview card per folder
  - `core/` Button, IconButton, Chip, Segmented, Checkbox, Toggle, PriorityBadge
  - `display/` Card, StatTile, ProgressRing, ProgressBar, AppIcon, SectionHeader
  - `journal/` MemoPaper, Tape, MoodPicker
  - `patterns/` TaskRow, HabitTile, CountdownCard
  - `navigation/` NavItem, TabBar, Sheet
- `ui_kits/desktop`, `ui_kits/mobile` — embed the live interactive source screens
- `Mascot.dc.html` — 16-animal mascot component (prop `animal`, `size`)
- `SKILL.md` — agent-skill entry

## Content fundamentals
- **Language:** casual Jakarta-style Indonesian, mixed with everyday English product words (task, habit, to-do, goal, overview). "Kamu"-free — copy addresses the user implicitly or as "Friend" ("Selamat pagi, Friend").
- **Tone:** warm, encouraging, a little playful; never corporate. Colloquialisms: *nggak, buat, kerjain, jadwalin, lepasin, bikin, pancingan*. E.g. "Nggak ada task di sini.", "Kosong. Waktunya istirahat 🌿", "Seret kartu buat mindahin…", "Butuh pancingan?"
- **Casing:** Sentence case for titles and buttons ("Simpan ke jurnal", "Tambah jadwal"). ALL CAPS only for tracked eyebrows/labels ("BERIKUTNYA", "HARI INI RASANYA…", "GOAL AKTIF · 176 HARI").
- **Separators:** middle dot `·` joins meta ("2/4 · Semua", "Sesi 3 dari 4 · 50 mnt hari ini"); en dash for ranges (19:00–20:30); ellipsis `…` on prompts/placeholders.
- **Numbers:** concrete and live — countdowns, "Sisa 3 jam", "Terlambat 2 jam", "12 hari beruntun". Tabular numerals on timers.
- **Emoji:** only for mood faces (😢😕😐🙂😄) and the rare empty-state accent. Never in headings or nav.
- **Journal voice:** handwritten font + diary phrasing ("Dear diary, hari ini…", "Hal kecil yang bikin senyum…").

## Visual foundations
- **Vibe:** cozy stationery / bullet-journal — warm paper, graph-paper backgrounds, ink outlines, washi tape, stickers, cute mascots. Chunky and tactile, not flat-minimal.
- **Color:** one warm ink `#2F2A24` for all text and outlines. Three user themes (Kuning default, Hijau, Ungu) swap the whole paper/primary/accent ramp via `[data-theme]`. Pastel tints carry meaning: categories (karier pink, kesehatan orange, keuangan green, diri purple, kerja blue), priorities (urgent/medium/low). Feature icons use saturated hues (`--icon-*`). No gradients except conic progress rings.
- **Type:** Baloo 2 ExtraBold for headings & numerals; Nunito 700/800 for all UI (never regular weight); Patrick Hand exclusively for journal/memo surfaces. Eyebrows 11px, 800, tracking .1em.
- **Backgrounds:** page = graph paper (`--pattern-grid`, 24px mobile / 28px desktop cell). Hero card = white dot grid on primary. Memo = ruled notebook with red margin (`[data-ruled]` + per-element `--paper-line` / `--paper-margin`), 30px pitch, 8 user-pickable paper stocks. No photography.
- **Corners:** generously rounded — pill buttons/chips, 22–26px cards, 32px panels. Signature **leaf corner**: three corners round, bottom-left tucked (`13 13 13 5`) on icons, habit marks, mood chips, FAB, event blocks.
- **Borders:** two systems — soft 2px `--line` on resting paper cards; 2.5–3px ink on interactive/hero objects (buttons, inputs, sidebar, tab bar, sticker cards, checkboxes). Tinted cards are borderless.
- **Shadows:** hard, unblurred offset drops only (`0 6px 0 rgba(47,42,36,.12)`); FAB/chunky CTA `0 5px 0 .18`; icon tiles get an inset bottom shade. No soft/ambient shadows, no blur, no glassmorphism.
- **Cards:** paper (paper bg + line), soft/primary/tinted (flat fill, no border), sticker (paper-2 + 3px ink + drop + optional tape + mascot peeking over the top edge).
- **Layout:** mobile — 16px gutter/stack, floating tab bar 12px from edges with center FAB; desktop — sticky rounded sidebar inset 28px, 28px grid gaps, rearrangeable widget grid. Horizontal scrollers bleed to screen edge.
- **Hover:** background shifts to `--hover` (a slightly deeper paper); links go accent → ink. **Press/selected:** fill with accent + paper text + ink border; mood/sticker items tilt −3° and scale up. Disabled = 45% opacity.
- **Motion:** minimal — `.2s ease` on width/position (sidebar collapse, toggle knob). No bounces or page transitions.
- **Transparency:** only for scrims (`rgba(47,42,36,.35)`), white wash tracks on tinted cards, and washi tape (80% opacity).
- **Playful tilt:** small rotations (−3 to −6°) on icon glyph tiles, tape, selected moods, journal entries.

## Iconography
- No icon font or SVG set. Icons are **unicode glyphs** (⌂ ✓ ⋯ ◎ ★ ⏳ ✎ ⊞ ▤ ‹ › ↺ ⏭ ▶ ❚❚ ▦ ⇅) or short numerals ("30", "25") set in Baloo 2 inside an **AppIcon** tile: saturated leaf tile → small ink-outlined paper square, tilted −6°.
- Simple CSS shapes stand in for pictograms (bell outline, streak flame drop, focus ring).
- Mascots (`Mascot.dc.html`) and stickers (`sticker-lib.js`) are the illustration layer.
- Emoji only for moods.

## Logo
No logo file exists. Brand mark = "ip" monogram in a primary-colored ink-outlined rounded tile + two-line wordmark "Improve / Personal" (second word in accent). Don't invent a new logo.

## Intentional additions
- `components/_preview.js` — compiles component JSX in the browser for preview cards.
