# Taste — Workflow

## Task handling
- Wants every work task tracked in Ergonio (project `personal-productivity`) via the `ergonio` skill: create the task before working and keep updating it. Confidence: 0.9
- Prefers direct execution and explicitly asks to skip the automated workflow pipeline ("jgn pake workflow kamu langsung aja"). Confidence: 0.85
- Expects the named specialist subagents to be delegated to by role instead of the agent doing everything inline — asks why they weren't used ("kok kamu gk pake subagent tad ya si bayu dll?"); e.g. hands FE work to `dimas` then verifies itself. Confidence: 0.8
- Wants spec/plan documents updated first, then implementation follows — on a design decision he says "update dulu architecturenya" (update the architecture doc before code follows). Confidence: 0.8
- Prefers additive, non-destructive file changes: new or consolidated artifacts are added as an alternative and existing files/folders are left intact ("yg pisah2 ini gk usah dihapus alternative aja"). Confidence: 0.75
- Before letting adjacent/out-of-scope work be picked up, asks whether it already has its own board task ("goal sih udah ada tasknya blm ya?") and expects the assistant to look the task up plus check the PRD/board before acting — work then stays inside the current task's scope and the leftover item is deferred to its own task (with a warning at the end) rather than bundled in. Confidence: 0.5
- When the board tooling is blocked (e.g. broken MCP `updateTask`), he'd rather perform the board action himself and just needs the exact target from the assistant — asks "mau dipindah mana? aku pindah manual dulu" and expects a single concrete answer (target status + assignee), not the assistant retrying the broken tool or asking him to decide the status. Confidence: 0.5
- Treats an existing feature silently disappearing (e.g. after a refactor/working-tree change) as an urgent regression: expects it root-caused and restored right away, not just noted ("kok fitur hias hilang ya, perbaiki dong"). Confidence: 0.65

## Decisions & research
- Before answering a technical/library decision (e.g. whether to add Pinia), expects the agent to read the existing project docs first — PRD, ARCHITECTURE — and ground the recommendation in them rather than answering from assumption ("coba cek PRD dulu"). Confidence: 0.7

## Git
- Expects finished work to be committed and pushed to the remote as the closing step, without being asked to plan it first ("commit perubahan2ya dan push ya"). Confidence: 0.75
- When the push cannot work (e.g. the repo has no configured remote), wants a short report of what failed plus the exact commands and URL needed — no invented/guessed remote. Confidence: 0.6
- Commit messages are conventional commits in English with a scope, a bulleted body describing each change, and a `Co-authored-by: CommandCodeBot <noreply@commandcode.ai>` trailer. Confidence: 0.7
- Treats committing outstanding work as its own step to do *before* moving on to the next task ("commit dulu"), not something batched at the end — and expects the pending tree split into several coherent commits by concern (agent config, taste/notes, the feature task, unrelated PWA work) instead of one bulk "wip" commit, with the tree verified clean afterwards. Confidence: 0.6

## Project conventions
- Every change must satisfy the three pillars — Keamanan, Performa, Kerapian — with any deliberate trade-off written down explicitly. Confidence: 0.9
- Keeps project-level rules in `.claude` folders, with the high-level pillars in the root CLAUDE.md and the per-app security/performance/tidiness details written by the security and system-analyst agents. Confidence: 0.75
- Keeps his own rule files consistent with the code: when a rule (e.g. a naming convention) conflicts with the desired architecture, he updates the rule rather than leaving a rule the repo itself violates. Confidence: 0.6
- Likes a roster of specialist agents per role (FE, BE, QA, mobile, security, system-analyst), each an expert in its field. Confidence: 0.7
- Prefers one cheap model pinned across all specialist agents (`deepseek/deepseek-v4.1-flash`) rather than premium per-role model tiers — cost/plan limits beat role-based model assignment (earlier Opus/Sonnet split was dropped for this). Confidence: 0.7
- When a pinned model errors out (e.g. needs a higher plan tier), wants the agent kept working on an available model instead of the config being dropped. Confidence: 0.6
- Works with Claude Code and Command Code on the same project and expects both toolchains to share one rules/skills setup instead of maintaining two parallel copies. Confidence: 0.75
- Avoids duplicating tool config: prefers pointing a tool at the existing `.claude` config (reference / import / link) over copying files across (".claude buat commandcode juga... gk usah salin"). Confidence: 0.8
- When no reference/link mechanism is supported by a tool (e.g. Command Code agent definitions), prefers converting the config into that tool's native format over junctions/symlinks — it's worth some duplication to keep it actually working and portable in git. Confidence: 0.6
- Dislikes hand-maintained duplicate agent config that silently drifts out of date; wants each client dir (`.qoder`, `.commandcode`) generated from the single source (`.claude`) by one repo sync script wired into the pre-commit hook, so "keep both in sync" is automatic rather than a manual step he has to remember ("tolong commandcode disesuaikan juga ya kalau bisa sekalian ada script sync"). Confidence: 0.55
- Keeps always-loaded agent memory lean: small rule files are `@`-imported, but large docs (ARCHITECTURE.md, PRD) are cited by path for on-demand reading instead of being imported, to avoid burning tokens every turn. Confidence: 0.6
- Registers MCP servers that carry credentials in a project-local (non-committed) scope so tokens never land in git. Confidence: 0.6
