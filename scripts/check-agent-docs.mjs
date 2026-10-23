#!/usr/bin/env node
// Jaga AGENTS.md (dibaca Qoder) tetap sinkron dengan CLAUDE.md (sumber kebenaran).
// Qoder tidak mendukung sintaks `@import`, jadi bagian inti ditulis ulang di
// AGENTS.md. Duplikasi beberapa baris itu murah; drift-nya yang mahal - script
// ini yang menangkap drift sebelum masuk commit.
import { access, readFile, readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (name) => readFile(join(root, name), 'utf8')

const PILLARS = /^\d\.\s+\*\*(?:Keamanan|Performa|Kerapian)\*\*.*$/gm
const IMPORT = /@(\.claude\/rules\/[\w.-]+\.md)/g
const PILLAR_COUNT = 3

const pillars = (markdown) =>
  [...markdown.matchAll(PILLARS)].map((match) => match[0].replace(/\s+/g, ' ').trim())

const [claude, agents] = await Promise.all([read('CLAUDE.md'), read('AGENTS.md')])
const errors = []

const fromClaude = pillars(claude)
const fromAgents = pillars(agents)

if (fromClaude.length !== PILLAR_COUNT) {
  errors.push(`CLAUDE.md: butuh ${PILLAR_COUNT} baris pilar, ketemu ${fromClaude.length}`)
}
if (fromAgents.length !== PILLAR_COUNT) {
  errors.push(`AGENTS.md: butuh ${PILLAR_COUNT} baris pilar, ketemu ${fromAgents.length}`)
}
if (fromClaude.join('|') !== fromAgents.join('|')) {
  errors.push('Teks tiga pilar di AGENTS.md beda dengan CLAUDE.md - samakan')
}

const imports = [...claude.matchAll(IMPORT)].map((match) => match[1])
const missing = imports.filter((path) => !agents.includes(path))
if (missing.length > 0) errors.push(`AGENTS.md belum menyebut rules: ${missing.join(', ')}`)

const orphans = [...agents.matchAll(IMPORT)]
  .map((match) => match[1])
  .filter((path) => !imports.includes(path))
if (orphans.length > 0)
  errors.push(`AGENTS.md menyebut rules yang tidak di-import CLAUDE.md: ${orphans.join(', ')}`)

// Tiap app punya pintu sendiri (AGENTS.md) yang menunjuk 3 rules platform.
// Kalau salah satu hilang, agent app kehilangan jalan masuk ke aturannya.
const APPS = ['apps/web', 'apps/mobile']
const APP_RULES = ['security.md', 'performance.md', 'code-quality.md']

for (const app of APPS) {
  const entry = await read(`${app}/AGENTS.md`)
  for (const rule of APP_RULES) {
    const path = `${app}/.claude/rules/${rule}`
    if (!entry.includes(`.claude/rules/${rule}`))
      errors.push(`${app}/AGENTS.md belum menyebut ${path}`)
    try {
      await access(join(root, path))
    } catch {
      errors.push(`rules hilang: ${path}`)
    }
  }
}

// Aturan status tidak boleh tumbuh kembali: MCP menghitung `progressPct` dari
// status (`updateTask` tidak menerimanya), dan subagent OpenCode mewarisi MCP
// sesi induk karena `tools:` dibuang saat sync. Keduanya koreksi task #60.
const AGENT_DOCS = [
  'AGENTS.md',
  'CLAUDE.md',
  '.claude/rules/ergonio-status-flow.md',
  '.claude/skills/ergonio/SKILL.md',
  '.claude/skills/orchestration/SKILL.md',
  ...(await readdir(join(root, '.claude', 'agents')))
    .filter((file) => file.endsWith('.md'))
    .map((file) => `.claude/agents/${file}`),
]

const SETS_PROGRESS = /`?progressPct`?\s*:/
const FALSE_MCP_CLAIM = /subagent[^\n]*tidak punya[^\n]*MCP|tidak punya tool MCP/i

for (const doc of AGENT_DOCS) {
  const text = await read(doc)
  if (SETS_PROGRESS.test(text))
    errors.push(`${doc}: jangan menginstruksikan progressPct - nilainya dihitung dari status`)
  if (FALSE_MCP_CLAIM.test(text))
    errors.push(
      `${doc}: klaim "subagent tidak punya MCP" tidak akurat di OpenCode - tulis batas tool-nya`,
    )
}

// Ringkasan di AGENTS.md harus selonggar rule: `todo` boleh dilewati.
const agentsEntry = await read('AGENTS.md')
if (!agentsEntry.includes('`todo` opsional'))
  errors.push('AGENTS.md: alur status harus menyebut `todo` opsional (boleh `backlog` -> `prog`)')

// Protokol komentar adalah jalur handoff developer <-> QA. Kalau frasa intinya
// hilang, aturan itu diam-diam rusak walau status flow masih "benar".
const RULES_DOC = '.claude/rules/ergonio-status-flow.md'
const rulesText = await read(RULES_DOC)
for (const phrase of ['getTaskComments', 'handoff', 'mulai cek', 'LULUS']) {
  if (!rulesText.includes(phrase))
    errors.push(`${RULES_DOC}: frasa protokol komentar hilang: ${phrase}`)
}
for (const doc of ['.claude/skills/ergonio/SKILL.md', '.claude/skills/orchestration/SKILL.md']) {
  if (!(await read(doc)).includes('Komentar task'))
    errors.push(`${doc}: harus merujuk bagian "Komentar task" di ${RULES_DOC}`)
}

if (errors.length > 0) {
  console.error(`check-agent-docs gagal:\n- ${errors.join('\n- ')}`)
  process.exit(1)
}
console.log(`check-agent-docs OK: ${PILLAR_COUNT} pilar + ${imports.length} rules sinkron`)
