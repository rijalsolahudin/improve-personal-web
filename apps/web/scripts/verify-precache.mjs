#!/usr/bin/env node
// Jaga manifest precache service worker: setiap URL di `precacheAndRoute([...])` wajib benar-benar
// bisa dilayani dari `.output/public`. Cukup satu entri yang 404 dan Workbox membatalkan SELURUH
// instalasi (`bad-precaching-response`), service worker berhenti di state `redundant`, dan tidak ada
// satu pun aset yang ter-cache - tanpa gejala yang terlihat: `registerType: 'autoUpdate'` tetap
// me-resolve promise registrasi walau install gagal, dan `devOptions.enabled: false` berarti dev
// tidak pernah menjalankan SW. Kegagalan seperti ini hanya kelihatan kalau URL-nya di-fetch.
//
// Aturan resolusi meniru static handler Nitro: `/x` dilayani dari berkas `x` atau `x/index.html`.
// Berkas `x.html` TIDAK dilayani di `/x` (itu perilaku Apache/nginx, bukan Nitro) - justru selisih
// inilah yang bikin `public/offline.html` lolos review tapi mematikan precache saat runtime.
import { readFile, stat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const publicDir = join(root, '.output', 'public')
const swPath = join(publicDir, 'sw.js')

const isFile = async (path) => {
  try {
    return (await stat(path)).isFile()
  } catch {
    return false
  }
}

const sw = await readFile(swPath, 'utf8').catch(() => null)
if (sw === null) {
  console.error(`verify-precache: ${swPath} tidak ada - jalankan \`nuxt build\` dulu`)
  process.exit(1)
}

const start = sw.indexOf('precacheAndRoute([')
// Dipanggil sebagai `precacheAndRoute([...], {})`; `]` pertama setelah start menutup array-nya (URL
// tidak pernah memuat `]`, jadi tidak perlu parser penuh).
const end = start === -1 ? -1 : sw.indexOf(']', start)
if (start === -1 || end === -1) {
  console.error('verify-precache: `precacheAndRoute([...]` tidak ditemukan di sw.js')
  process.exit(1)
}

const urls = [...sw.slice(start, end).matchAll(/url:"([^"]*)"/g)].map((match) => match[1])
if (urls.length === 0) {
  console.error('verify-precache: manifest precache kosong')
  process.exit(1)
}

// Entri manifest sudah final: Workbox me-resolve path relatif terhadap scope `/sw.js`.
const candidatesOf = (url) => {
  const path = decodeURIComponent(url.replace(/^\/+/, ''))
  if (path === '' || path === '.') return ['index.html']
  return [path, join(path, 'index.html')]
}

const missing = []
for (const url of urls) {
  const candidates = candidatesOf(url)
  let served = false
  for (const candidate of candidates) {
    if (await isFile(join(publicDir, candidate))) {
      served = true
      break
    }
  }
  if (!served) missing.push({ url, candidates })
}

if (missing.length > 0) {
  console.error(`verify-precache GAGAL: ${missing.length}/${urls.length} entri tidak bisa dilayani`)
  for (const { url, candidates } of missing) {
    console.error(`- url:"${url}" -> tidak ada (dicoba: ${candidates.join(', ')})`)
  }
  process.exit(1)
}

process.stdout.write(`verify-precache OK: ${urls.length} entri precache semuanya bisa dilayani\n`)
