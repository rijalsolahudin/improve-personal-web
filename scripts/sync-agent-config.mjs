#!/usr/bin/env node
// Salin agent config dari `.claude` (sumber kebenaran) ke `.qoder` dan `.commandcode`.
//
// Kenapa salinan, bukan symlink: workspace ini ada di mount `fuse` yang tidak
// mendukung symlink - `ln -s` di sana menghasilkan file teks berisi path target,
// sehingga client melihat dua file, bukan dua direktori.
//
// `.commandcode/skills` tidak perlu disalin: `.commandcode/settings.json` sudah
// menunjuk langsung ke `.claude/skills`.
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
const FRONTMATTER = /^---\n[\s\S]*?\n---\n\n/

const toCommandCode = (markdown, file) =>
  markdown
    .replace(TOOL_WORD, (tool) => COMMAND_CODE_TOOLS[tool])
    .replace(/^model:[^\n]*$/m, `model: ${COMMAND_CODE_MODEL}`)
    .replace(
      FRONTMATTER,
      (frontmatter) =>
        `${frontmatter}> Sumber asli: \`.claude/agents/${file}\`. Yang beda cuma nama tool + pin \`model\` (format Command Code). Ubah persona di file sumber, lalu jalankan \`pnpm sync:agents\`.\n\n`,
    )

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

console.log(`.qoder disinkronkan dari .claude: ${qoderAgents} agent, ${qoderSkills} skill`)
console.log(
  `.commandcode disinkronkan dari .claude: ${commandCodeAgents} agent (skill dibaca langsung dari .claude/skills)`,
)
