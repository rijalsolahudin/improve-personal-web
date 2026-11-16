import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { chromium, type Page } from '@playwright/test'

import { LICENSE_TOKEN_VERSION } from '@improve-personal/contracts'

import { TECH_IDENTITY } from '../../shared/tech-identity'
import { createLicenseSigner } from '../../server/utils/license-signing'
import { DEMO_TZ, buildDemoBackup } from './demo-data'

/**
 * Ambil ulang screenshot fitur untuk landing page (`public/landing/*.webp`).
 *
 *   NUXT_LICENSE_SIGNING_KEY=... tsx scripts/landing/shots.ts [baseUrl]
 *
 * Butuh dev server yang sedang jalan (default `http://localhost:3700`) dan seed lisensi environment
 * itu (dari `.env`): skrip menandatangani token lisensi lifetime untuk browser sementara, meng-import
 * data contoh lewat halaman Import (jalur yang sama dengan user), lalu memotret tiap halaman.
 * Browser memakai profil baru setiap kali, jadi data lokal developer tidak tersentuh.
 *
 * Konversi ke WebP memakai ImageMagick (`magick`).
 */

const BASE_URL = process.argv[2] ?? 'http://localhost:3700'
const OUT_DIR = resolve(import.meta.dirname, '../../public/landing')

/** Layar lebar (16:10, sama dengan rasio bingkai di landing) supaya isi halaman lega. */
const VIEWPORT = { width: 1440, height: 900 }
const PHONE_VIEWPORT = { width: 390, height: 844 }
/** Render 2x lalu diperkecil: teks tetap tajam di layar retina tanpa berkas raksasa. */
const DEVICE_SCALE = 2
/** Lebar WebP desktop: besar untuk layar lebar/retina, kecil untuk `srcset` di HP. */
const OUTPUT_WIDTHS = [1600, 800] as const
const PHONE_OUTPUT_WIDTH = 600
const WEBP_QUALITY = '78'
/** Jeda setelah halaman tenang: animasi masuk & font selesai. */
const SETTLE_MS = 1_200
/** Jam yang dipotret: pertengahan hari kerja, supaya timeline Daily/kalender berisi. */
const SHOT_HOUR_WIB = 10
const SHOT_MINUTE = 30
/** Overlay dev (devtools Nuxt) & tombol mengambang "Hias" tidak ikut dipotret. */
const HIDE_CHROME_CSS = `
  [id^='nuxt-devtools'], nuxt-devtools-frame { display: none !important; }
`

const SHOTS: readonly { readonly name: string; readonly path: string }[] = [
  { name: 'daily', path: '/app' },
  { name: 'kalender', path: '/app/kalender' },
  { name: 'to-do', path: '/app/to-do' },
  { name: 'eisenhower', path: '/app/eisenhower' },
  { name: 'habit', path: '/app/habit' },
  { name: 'journal', path: '/app/journal' },
  { name: 'goals', path: '/app/goals' },
  { name: 'overview', path: '/app/overview' },
  { name: 'pomodoro', path: '/app/pomodoro' },
  { name: 'countdown', path: '/app/countdown' },
]

/**
 * Sama dengan `SIDEBAR_STORAGE_KEY` di `app/stores/ui.ts`. Ditulis ulang karena store itu memakai
 * auto-import Nuxt (`defineStore`) sehingga tidak bisa diimpor dari skrip Node ini.
 */
const SIDEBAR_STORAGE_KEY = `${TECH_IDENTITY.storagePrefix}sb`

const PHONE_SHOTS: readonly string[] = ['daily', 'habit']

function demoLicenseToken(): string {
  const seed = process.env.NUXT_LICENSE_SIGNING_KEY
  if (!seed) throw new Error('NUXT_LICENSE_SIGNING_KEY wajib (pakai seed dev dari .env)')

  return createLicenseSigner(seed).sign({
    v: LICENSE_TOKEN_VERSION,
    lid: randomUUID(),
    did: randomUUID(),
    iat: Math.floor(Date.now() / 1_000),
    ed: 'standard',
    plan: 'lifetime',
    exp: null,
  })
}

/** Hari ini jam `SHOT_HOUR_WIB` WIB (UTC+7), dalam epoch ms. */
function shotTimeMs(): number {
  const now = new Date()
  const wibNow = new Date(now.getTime() + 7 * 60 * 60 * 1000)
  return Date.UTC(
    wibNow.getUTCFullYear(),
    wibNow.getUTCMonth(),
    wibNow.getUTCDate(),
    SHOT_HOUR_WIB - 7,
    SHOT_MINUTE,
  )
}

async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle')
  await page.addStyleTag({ content: HIDE_CHROME_CSS })
  await page.getByRole('button', { name: /Hias/ }).evaluateAll((buttons) => {
    for (const button of buttons) (button as HTMLElement).style.visibility = 'hidden'
  })
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(SETTLE_MS)
}

async function importDemoData(page: Page, backupPath: string): Promise<void> {
  await page.goto(`${BASE_URL}/app/import-export`)
  await page.locator('#backup-file').setInputFiles(backupPath)
  await page.getByRole('button', { name: 'Import data' }).click()
  await page.getByRole('status').waitFor()
}

function toWebp(pngPath: string, outName: string, width: number): void {
  execFileSync('magick', [
    pngPath,
    '-resize',
    `${width}x`,
    '-quality',
    WEBP_QUALITY,
    '-define',
    'webp:method=6',
    join(OUT_DIR, `${outName}.webp`),
  ])
}

async function main(): Promise<void> {
  const work = join(tmpdir(), `landing-shots-${randomUUID()}`)
  mkdirSync(work, { recursive: true })
  mkdirSync(OUT_DIR, { recursive: true })

  const backupPath = join(work, 'demo.json')
  const shotTime = shotTimeMs()
  writeFileSync(backupPath, buildDemoBackup(shotTime))

  const token = demoLicenseToken()
  const browser = await chromium.launch()
  try {
    const context = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: DEVICE_SCALE,
      locale: 'id-ID',
      timezoneId: DEMO_TZ,
      reducedMotion: 'reduce',
    })
    await context.addInitScript(
      ([licenseKey, license, sidebarKey]) => {
        window.localStorage.setItem(licenseKey, license)
        // Sidebar ditutup: area isi lebih luas di screenshot.
        window.localStorage.setItem(sidebarKey, '1')
      },
      [`${TECH_IDENTITY.storagePrefix}license`, token, SIDEBAR_STORAGE_KEY] as const,
    )

    const page = await context.newPage()
    await page.clock.install({ time: shotTime })
    await page.clock.resume()
    await importDemoData(page, backupPath)

    for (const shot of SHOTS) {
      await page.goto(`${BASE_URL}${shot.path}`)
      await settle(page)
      const png = join(work, `${shot.name}.png`)
      await page.screenshot({ path: png })
      for (const width of OUTPUT_WIDTHS) toWebp(png, `${shot.name}-${width}`, width)

      if (PHONE_SHOTS.includes(shot.name)) {
        await page.setViewportSize(PHONE_VIEWPORT)
        await settle(page)
        const phonePng = join(work, `${shot.name}-phone.png`)
        await page.screenshot({ path: phonePng })
        toWebp(phonePng, `${shot.name}-phone`, PHONE_OUTPUT_WIDTH)
        await page.setViewportSize(VIEWPORT)
      }
      process.stdout.write(`ok ${shot.name}\n`)
    }
  } finally {
    await browser.close()
    rmSync(work, { recursive: true, force: true })
  }
}

await main()
