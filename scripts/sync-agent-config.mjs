#!/usr/bin/env node
// Salin agent config dari `.claude` (sumber kebenaran) ke `.qoder`, `.commandcode`,
// dan `.opencode`.
//
// Kenapa salinan, bukan symlink: workspace ini ada di mount `fuse` yang tidak
// mendukung symlink - `ln -s` di sana menghasilkan file teks berisi path target,
// sehingga client melihat dua file, bukan dua direktori.
//
// Skill tidak perlu disalin ke `.opencode/skills`: `.commandcode/settings.json`
// menunjuk langsung ke `.claude/skills`, dan `opencode.json` di root menunjuk
// `.qoder/skills` (salinan yang sama dengan yang dipakai Qoder). OpenCode juga
// tetap membaca `.claude/skills` sebagai compatibility source.
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const agentsSource = join(root, '.claude', 'agents')
const skillsSource = join(root, '.claude', 'skills')

// `model:` berisi id model Claude Code yang tidak dikenal Qoder. Kalau dibiarkan,
// subagent tampil dengan status "model unavailable"; dibuang supaya pakai default.
const stripModel = (markdown) => markdown.replace(/^model:[^\n]*\n/gm, '')

// Command Code memakai nama tool sendiri dan id model ber-prefix provider.
const COMMAND_CODE_MODEL = 'deepseek/deepseek-v4.1-flash'
const COMMAND_CODE_TOOLS = {
  Read: 'read_file',
  Glob: 'glob',
  Grep: 'grep',
  Bash: 'shell_command',
  Write: 'write_file',
  Edit: 'edit_file',
}
const TOOL_WORD = /\b(?:Read|Glob|Grep|Bash|Write|Edit)\b/g
const FRONTMATTER = /^---\n([\s\S]*?)\n---\n\n/

const toCommandCode = (markdown, file) =>
  markdown
    .replace(TOOL_WORD, (tool) => COMMAND_CODE_TOOLS[tool])
    .replace(/^model:[^\n]*$/m, `model: ${COMMAND_CODE_MODEL}`)
    .replace(
      FRONTMATTER,
      (frontmatter) =>
        `${frontmatter}> Sumber asli: \`.claude/agents/${file}\`. Yang beda cuma nama tool + pin \`model\` (format Command Code). Ubah persona di file sumber, lalu jalankan \`pnpm sync:agents\`.\n\n`,
    )

// OpenCode V2 membuang field legacy `tools`; batasan tool ditulis sebagai
// `permissions` (aturan terakhir yang menang). Agent yang di sumbernya cuma punya
// `Write` (tanpa `Edit`) memang tidak boleh menyentuh kode produk, jadi izin
// edit-nya dipersempit ke `reports/` - tempat report audit/analisis ditulis.
// `model:` juga dibuang supaya subagent mewarisi model sesi induk, tidak terikat
// ke provider tertentu.
const OPENCODE_REPORTS_ONLY = [
  'permissions:',
  '  - action: edit',
  '    resource: "*"',
  '    effect: deny',
  '  - action: edit',
  '    resource: "reports/**"',
  '    effect: allow',
].join('\n')

const toOpencode = (markdown, file) => {
  const fields = markdown.match(FRONTMATTER)?.[1] ?? ''
  const tools = fields.match(/^tools:\s*(.+)$/m)?.[1] ?? ''
  const isWriteOnly = /\bWrite\b/.test(tools) && !/\bEdit\b/.test(tools)

  const frontmatter = [
    ...fields.split('\n').filter((line) => !/^(?:name|tools|model):/.test(line)),
    'mode: subagent',
    ...(isWriteOnly ? [OPENCODE_REPORTS_ONLY] : []),
  ].join('\n')

  return markdown.replace(
    FRONTMATTER,
    `---\n${frontmatter}\n---\n\n> Sumber asli: \`.claude/agents/${file}\`. Yang beda cuma \`mode\`/\`permissions\` (format OpenCode V2) dan \`model\` yang diwarisi sesi induk. Ubah persona di file sumber, lalu jalankan \`pnpm sync:agents\`.\n\n`,
  )
}

const listDirs = async (path) =>
  (await readdir(path, { withFileTypes: true })).filter((entry) => entry.isDirectory())

async function syncAgents(clientDir, transform) {
  const to = join(root, clientDir, 'agents')

  await rm(to, { recursive: true, force: true })
  await mkdir(to, { recursive: true })

  const files = (await readdir(agentsSource)).filter((file) => file.endsWith('.md'))
  for (const file of files) {
    const markdown = await readFile(join(agentsSource, file), 'utf8')
    await writeFile(join(to, file), transform(markdown, file))
  }
  return files.length
}

async function syncSkills(clientDir) {
  const to = join(root, clientDir, 'skills')

  await rm(to, { recursive: true, force: true })
  await mkdir(to, { recursive: true })

  const dirs = await listDirs(skillsSource)
  for (const dir of dirs) {
    await cp(join(skillsSource, dir.name), join(to, dir.name), { recursive: true })
  }
  return dirs.length
}

const qoderAgents = await syncAgents('.qoder', stripModel)
const qoderSkills = await syncSkills('.qoder')
const commandCodeAgents = await syncAgents('.commandcode', toCommandCode)
const opencodeAgents = await syncAgents('.opencode', toOpencode)

console.log(`.qoder disinkronkan dari .claude: ${qoderAgents} agent, ${qoderSkills} skill`)
console.log(
  `.commandcode disinkronkan dari .claude: ${commandCodeAgents} agent (skill dibaca langsung dari .claude/skills)`,
)
console.log(
  `.opencode disinkronkan dari .claude: ${opencodeAgents} agent (skill dibaca dari .qoder/skills lewat opencode.json, model ikut sesi induk)`,
)
