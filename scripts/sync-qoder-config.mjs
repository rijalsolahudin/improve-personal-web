#!/usr/bin/env node
// Salin agent config dari `.claude` (sumber kebenaran) ke `.qoder` (yang dibaca Qoder).
//
// Kenapa salinan, bukan symlink: workspace ini ada di mount `fuse` yang tidak
// mendukung symlink - `ln -s` di sana menghasilkan file teks berisi path target,
// sehingga Qoder melihat dua file, bukan dua direktori.
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const source = join(root, '.claude')
const target = join(root, '.qoder')

// `model:` berisi id model Claude Code yang tidak dikenal Qoder. Kalau dibiarkan,
// subagent tampil dengan status "model unavailable"; dibuang supaya pakai default.
const stripClaudeModel = (markdown) => markdown.replace(/^model:[^\n]*\n/gm, '')

const listDirs = async (path) =>
  (await readdir(path, { withFileTypes: true })).filter((entry) => entry.isDirectory())

async function syncAgents() {
  const from = join(source, 'agents')
  const to = join(target, 'agents')

  await rm(to, { recursive: true, force: true })
  await mkdir(to, { recursive: true })

  const files = (await readdir(from)).filter((file) => file.endsWith('.md'))
  for (const file of files) {
    const markdown = await readFile(join(from, file), 'utf8')
    await writeFile(join(to, file), stripClaudeModel(markdown))
  }
  return files.length
}

async function syncSkills() {
  const from = join(source, 'skills')
  const to = join(target, 'skills')

  await rm(to, { recursive: true, force: true })
  await mkdir(to, { recursive: true })

  const dirs = await listDirs(from)
  for (const dir of dirs) {
    await cp(join(from, dir.name), join(to, dir.name), { recursive: true })
  }
  return dirs.length
}

const agents = await syncAgents()
const skills = await syncSkills()

console.log(`.qoder disinkronkan dari .claude: ${agents} agent, ${skills} skill`)
