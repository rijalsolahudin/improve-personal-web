import type { LocalDataSession } from '~/utils/storage/session'

/**
 * Menyambungkan engine sync ke shell web.
 *
 * Engine-nya sendiri (`packages/core/src/sync`) dan endpoint `/v1/sync/*` sudah ada sejak T21; yang
 * belum ada adalah pemanggil dari UI. Plugin ini yang memutuskan KAPAN sync jalan, bukan mengubah
 * aturan sync-nya.
 *
 * Sengaja `import()` dinamis ke modul controller: plugin ini ikut dimuat di semua rute, sedangkan
 * push/pull + kontrak sync hanya berguna untuk `/app/**`. Landing dan `/login` tidak boleh membayar
 * chunk itu.
 */

const APP_PREFIX = '/app'

export default defineNuxtPlugin(() => {
  const route = useRoute()
  const localData = useLocalData()
  const auth = useAuthSession()

  let stop: (() => void) | null = null
  let startingFor: string | null = null

  function stopSync(): void {
    stop?.()
    stop = null
    startingFor = null
  }

  async function attach(session: LocalDataSession): Promise<void> {
    if (startingFor === session.userId) return
    startingFor = session.userId

    const { startSync } = await import('~/utils/sync/controller')

    // Akun bisa berganti saat `import()` masih berjalan. Jangan pernah memasang controller untuk
    // sesi yang sudah bukan sesi aktif.
    if (startingFor !== session.userId || localData.current()?.userId !== session.userId) return

    stop = startSync(session, window.location.origin)
  }

  /**
   * Identitas login berubah TANPA reload (mis. login akun lain di tab ini). Controller memegang sesi
   * AKUN lama beserta data lokalnya, jadi ia harus berhenti SEKARANG - bukan menunggu navigasi
   * berikutnya, dan bukan mengandalkan reload yang belum tentu terjadi. Penjagaan sisi server tetap
   * ada (`x-expected-user-id`), tetapi klien tidak boleh mengirim batch yang sudah diketahuinya basi.
   */
  watch(
    () => auth.session.value?.user.id ?? null,
    () => stopSync(),
  )

  watch(
    () => {
      const state = localData.state.value
      return [state?.status ?? 'idle', state?.userId ?? null, route.path] as const
    },
    ([status, , path]) => {
      if (status !== 'ready' || !path.startsWith(APP_PREFIX)) {
        stopSync()
        return
      }

      const session = localData.current()
      if (session === null) {
        stopSync()
        return
      }

      void attach(session)
    },
    { immediate: true },
  )
})
