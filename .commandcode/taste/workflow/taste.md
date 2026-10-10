# Taste — Workflow

## Task handling
- Wants every work task tracked in Ergonio (project `personal-productivity`) via the `ergonio` skill: create the task before working and keep updating it. Confidence: 0.9
- Prefers direct execution and explicitly asks to skip the automated workflow pipeline ("jgn pake workflow kamu langsung aja"). Confidence: 0.85
- Prefers work done inline without subagents when the task allows it ("jgn apke sub agent", "langsung aja"). Confidence: 0.75
- Wants spec/plan documents updated first, then implementation follows. Confidence: 0.75
- Prefers additive, non-destructive file changes: new or consolidated artifacts are added as an alternative and existing files/folders are left intact ("yg pisah2 ini gk usah dihapus alternative aja"). Confidence: 0.75

## Project conventions
- Every change must satisfy the three pillars — Keamanan, Performa, Kerapian — with any deliberate trade-off written down explicitly. Confidence: 0.9
- Keeps project-level rules in `.claude` folders, with the high-level pillars in the root CLAUDE.md and the per-app security/performance/tidiness details written by the security and system-analyst agents. Confidence: 0.75
- Likes a roster of specialist agents per role (FE, BE, QA, mobile, security, system-analyst), each an expert in its field. Confidence: 0.7
- Assigns model tiers deliberately to agent roles: Opus for frontend, Sonnet for backend/QA (all Sonnet 5.5 generation). Confidence: 0.6
