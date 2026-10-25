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
// sesi induk karena `tools:` dibuang saat sync. Semua ini koreksi task #60/#64.
const RULES_DOC = '.claude/rules/ergonio-status-flow.md'
const ERGONIO_SKILL = '.claude/skills/ergonio/SKILL.md'
const OPENCODE_README = '.opencode/README.md'
const ORCHESTRATION_SKILL = '.claude/skills/orchestration/SKILL.md'

const agentFiles = (await readdir(join(root, '.claude', 'agents')))
  .filter((file) => file.endsWith('.md'))
  .map((file) => `.claude/agents/${file}`)

const AGENT_DOCS = [
  'AGENTS.md',
  'CLAUDE.md',
  RULES_DOC,
  ERGONIO_SKILL,
  ORCHESTRATION_SKILL,
  OPENCODE_README,
  ...agentFiles,
]

// `progressPct` baru jadi instruksi kalau diikuti nilai (`progressPct: 90`,
// `"progressPct": 90`, `progressPct = 90`). Penjelasan read-only seperti
// "`progressPct`: dihitung server" sengaja tidak ditangkap.
const SETS_PROGRESS = /["'`]?progressPct["'`]?\s*[:=]\s*["'`]?(?:\d|true|false|null)/i
// Klaim "subagent tidak punya/dapat memakai MCP" salah di OpenCode. Negasi yang
// sah soal `progressPct` ("tidak bisa di-set lewat MCP") dikecualikan.
const FALSE_MCP_CLAIM =
  /(?:tidak|tak|nggak|bukan)\s+(?:punya|dapat|bisa|ada|memiliki|memegang)\b(?:(?!\b(?:di-set|diatur|dikirim|kirim)\b)[^\n]){0,40}\bMCP\b|\btanpa\s+(?:tool\s+)?MCP\b/i

for (const doc of AGENT_DOCS) {
  const text = await read(doc)
  if (SETS_PROGRESS.test(text))
    errors.push(`${doc}: jangan menginstruksikan progressPct - nilainya dihitung dari status`)
  if (FALSE_MCP_CLAIM.test(text))
    errors.push(
      `${doc}: klaim "subagent tidak punya MCP" tidak akurat di OpenCode - tulis batas tool-nya`,
    )
}

// Agent pemilik alur developer harus selonggar rule: `todo` boleh dilewati.
// Kalau hanya AGENTS.md yang dijaga, agent yang membaca filenya sendiri merasa
// `todo` wajib.
const agentsEntry = await read('AGENTS.md')
if (!agentsEntry.includes('`todo` opsional'))
  errors.push('AGENTS.md: alur status harus menyebut `todo` opsional (boleh `backlog` -> `prog`)')

for (const doc of agentFiles) {
  const text = await read(doc)
  if (text.includes('`backlog`') && !text.includes('`todo` opsional'))
    errors.push(
      `${doc}: alur status harus menyebut \`todo\` opsional (boleh \`backlog\` -> \`prog\`)`,
    )
}

// Daftar tool mutasi terlarang harus utuh: `deleteTask` menghapus seluruh subtask
// di semua kedalaman, dan milestone pun bisa dihapus. Daftar yang bolong dibaca
// agent sebagai izin.
const MUTATION_TOOLS = [
  'createTask',
  'updateTask',
  'deleteTask',
  'createSubtasks',
  'createComment',
  'updateComment',
  'deleteComment',
  'createMilestone',
  'updateMilestone',
  'deleteMilestone',
]

for (const doc of [RULES_DOC, ORCHESTRATION_SKILL]) {
  const text = await read(doc)
  const missingTools = MUTATION_TOOLS.filter((tool) => !text.includes(tool))
  if (missingTools.length > 0)
    errors.push(`${doc}: daftar tool mutasi terlarang belum memuat ${missingTools.join(', ')}`)
}
if (!(await read(OPENCODE_README)).includes('deleteTask'))
  errors.push(`${OPENCODE_README}: larangan harus menyebut deleteTask (tool destruktif)`)

// Protokol komentar adalah jalur handoff developer <-> QA. Kalau frasa intinya
// hilang, aturan itu diam-diam rusak walau status flow masih "benar".
const rulesText = await read(RULES_DOC)
for (const phrase of ['getTaskComments', 'handoff', 'mulai cek', 'LULUS']) {
  if (!rulesText.includes(phrase))
    errors.push(`${RULES_DOC}: frasa protokol komentar hilang: ${phrase}`)
}
for (const doc of [ERGONIO_SKILL, ORCHESTRATION_SKILL]) {
  if (!(await read(doc)).includes('Komentar task'))
    errors.push(`${doc}: harus merujuk bagian "Komentar task" di ${RULES_DOC}`)
}

// Salinan agent/skill untuk client lain (`.qoder`, `.commandcode`, `.opencode`)
// dihasilkan `pnpm sync:agents`. Tanpa penjaga, drift-nya senyap: OpenCode membaca
// skill dari `.qoder/skills`, jadi skill basi = agent menjalankan aturan lama tanpa
// ada yang gagal. N1/N2 QA #82.
const CLIENT_DIRS = ['.qoder', '.commandcode', '.opencode']
// Samakan dengan `stripModel` di scripts/sync-agent-config.mjs: `.qoder` hanya
// membuang field `model:`, jadi sisanya harus identik dengan sumber.
const stripModel = (markdown) => markdown.replace(/^model:[^\n]*\n/gm, '')

for (const file of agentFiles) {
  const name = file.replace('.claude/agents/', '')
  const source = await read(file)
  const qoderPath = `.qoder/agents/${name}`
  try {
    const copy = await read(qoderPath)
    if (copy !== stripModel(source))
      errors.push(`${qoderPath}: drift dari ${file} - jalankan \`pnpm sync:agents\``)
  } catch {
    errors.push(`salinan agent hilang: ${qoderPath} - jalankan \`pnpm sync:agents\``)
  }
  for (const client of CLIENT_DIRS.filter((dir) => dir !== '.qoder')) {
    const path = `${client}/agents/${name}`
    try {
      await access(join(root, path))
    } catch {
      errors.push(`salinan agent hilang: ${path} - jalankan \`pnpm sync:agents\``)
    }
  }
}

const skillNames = (await readdir(join(root, '.claude', 'skills'), { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)

for (const name of skillNames) {
  const source = await read(`.claude/skills/${name}/SKILL.md`)
  const path = `.qoder/skills/${name}/SKILL.md`
  try {
    const copy = await read(path)
    if (copy !== source) errors.push(`${path}: drift dari sumber - jalankan \`pnpm sync:agents\``)
  } catch {
    errors.push(`salinan skill hilang: ${path} - jalankan \`pnpm sync:agents\``)
  }
}

if (errors.length > 0) {
  console.error(`check-agent-docs gagal:\n- ${errors.join('\n- ')}`)
  process.exit(1)
}
console.log(`check-agent-docs OK: ${PILLAR_COUNT} pilar + ${imports.length} rules sinkron`)
