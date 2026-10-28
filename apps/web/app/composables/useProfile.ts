import { userProfileSchema, type UserProfile } from '@improve-personal/core'

import { newestRecord } from '~/utils/storage/newest-record'
import type { LocalDataSession } from '~/utils/storage/session'
import {
  isReloadSessionActive,
  readAfterWrites,
  registerSyncReloader,
  reloadSession,
} from '~/utils/sync/refresh'

/**
 * Profil user (nama tampilan + foto) dari record `user_profile`: terenkripsi, per akun, ikut sync.
 *
 * State profil sengaja di variabel modul (`shallowRef`), BUKAN `useState`: nama & foto adalah PII, dan
 * `useState` ikut diserialisasi ke payload SSR (security.md §2). Profil hanya pernah diisi di client
 * setelah data lokal terbuka, jadi server tidak pernah memegang nilainya.
 */

export type ProfileView = { readonly displayName: string; readonly avatar: string | null }

export type ProfileSession = Pick<
  LocalDataSession,
  'userId' | 'repos' | 'writer' | 'newId' | 'clock'
>

export type UseProfileOptions = {
  /** Dipakai test: sesi data lokal tiruan, tanpa membuka IndexedDB/kripto. */
  readonly session?: () => Promise<ProfileSession | null>
}

export type ProfileStatus = 'idle' | 'loading' | 'ready' | 'error'

const EMPTY_PROFILE: ProfileView = { displayName: '', avatar: null }

const profile = shallowRef<ProfileView>(EMPTY_PROFILE)
/** Id record milik akun ini; dipakai ulang supaya simpan menimpa, bukan menumpuk record baru. */
let recordId: string | null = null
let hydrateInFlight: Promise<void> | null = null
let reloadInFlight: Promise<void> | null = null
let writeQueue: Promise<void> = Promise.resolve()

function toView(data: unknown): ProfileView {
  const parsed = userProfileSchema.safeParse(data)
  // Record rusak/asing (mis. dari versi lain) tidak boleh menggagalkan tampilan: pakai profil kosong.
  if (!parsed.success) return EMPTY_PROFILE
  return { displayName: parsed.data.displayName, avatar: parsed.data.avatar }
}

export function useProfile(options: UseProfileOptions = {}) {
  const localData = useLocalData()
  // Membaca profil TIDAK boleh membuka penyimpanan (dipanggil dari sidebar & header di setiap
  // halaman): pakai sesi yang sudah terbuka. Hanya simpan - aksi user - yang boleh membukanya.
  const readSession = options.session ?? (async () => localData.current())
  const writeSession = options.session ?? (() => localData.ensure())

  const status = useState<ProfileStatus>('profileStatus', () => 'idle')
  const error = useState<string | null>('profileError', () => null)

  function apply(record: { readonly id: string; readonly data: unknown } | null): void {
    if (record === null) return
    recordId = record.id
    profile.value = toView(record.data)
  }

  function hydrate(): Promise<void> {
    if (hydrateInFlight) return hydrateInFlight
    if (status.value === 'ready') return Promise.resolve()

    hydrateInFlight = (async () => {
      status.value = 'loading'
      try {
        const session = await readSession()
        if (session === null) {
          status.value = 'idle'
          return
        }
        apply(newestRecord(await session.repos.userProfile.listAll()))
        status.value = 'ready'
        error.value = null
      } catch (cause) {
        status.value = 'error'
        error.value = cause instanceof Error ? cause.message : 'profil gagal dimuat'
        hydrateInFlight = null
      }
    })()

    return hydrateInFlight
  }

  /** Muat ulang setelah pull menerapkan profil dari perangkat lain. */
  function reload(): Promise<void> {
    if (status.value === 'idle') return Promise.resolve()

    reloadInFlight ??= (async () => {
      try {
        const target = await reloadSession(localData.current, readSession)
        if (target === null) return

        const newest = await readAfterWrites(
          () => writeQueue,
          async () => newestRecord(await target.session.repos.userProfile.listAll()),
        )
        if (!isReloadSessionActive(target, localData.current)) return

        apply(newest)
        status.value = 'ready'
        error.value = null
      } catch (cause) {
        status.value = 'error'
        error.value = cause instanceof Error ? cause.message : 'profil gagal dimuat'
      } finally {
        reloadInFlight = null
      }
    })()

    return reloadInFlight
  }

  /** Simpan profil. Melempar kalau gagal, supaya dialog bisa menampilkan pesannya. */
  async function save(next: ProfileView): Promise<void> {
    const run = writeQueue.then(async () => {
      const session = await writeSession()
      if (session === null) throw new Error('data lokal belum terbuka')

      const id = recordId ?? session.newId()
      const valid = userProfileSchema.safeParse({
        id,
        displayName: next.displayName,
        avatar: next.avatar,
        updatedAt: session.clock.nowMs(),
      } satisfies UserProfile)
      if (!valid.success) throw new Error('profil tidak valid')

      await session.writer.write({ type: 'user_profile', id, data: () => valid.data })
      recordId = id
      profile.value = { displayName: valid.data.displayName, avatar: valid.data.avatar }
      error.value = null
    })
    // Antrean tetap jalan walau satu simpan gagal.
    writeQueue = run.catch(() => undefined)
    await run
  }

  watch(
    () => localData.state.value?.status ?? 'idle',
    (next) => {
      if (next === 'ready') void hydrate()
    },
    { immediate: true },
  )

  // Akun berganti tanpa reload: profil akun sebelumnya tidak boleh tetap tampil.
  watch(
    () => localData.state.value?.userId ?? null,
    (next, previous) => {
      if (next === previous) return
      resetProfileState()
      status.value = 'idle'
      if (next !== null) void hydrate()
    },
  )

  if (options.session) void hydrate()

  registerSyncReloader('profile', reload)

  return {
    profile: computed(() => profile.value),
    status: computed(() => status.value),
    error: computed(() => error.value),
    hydrate,
    reload,
    save,
  }
}

function resetProfileState(): void {
  profile.value = EMPTY_PROFILE
  recordId = null
  hydrateInFlight = null
}

/** Dipakai test: tidak ada state profil atau antrean tulis yang bocor antar kasus. */
export function resetProfileForTest(): void {
  resetProfileState()
  reloadInFlight = null
  writeQueue = Promise.resolve()
}
