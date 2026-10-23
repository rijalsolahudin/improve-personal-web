import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'

/**
 * QA T15: `/app/panduan` harus menang atas route dinamis `app/pages/app/[feature].vue`.
 *
 * `[feature].vue` memakai `validate` yang menerima SEMUA id fitur - termasuk `panduan`. Kalau route
 * statis kalah prioritas (mis. karena file-nya salah nama), user akan melihat placeholder "fitur belum
 * dikerjakan" padahal halaman Panduan sudah ada. Test ini membaca tabel route yang benar-benar dipakai
 * app, bukan asumsi soal urutan file.
 */

const RouteProbe = defineComponent({
  setup() {
    const router = useRouter()
    const matchedFor = (path: string) => router.resolve(path).matched.map((record) => record.path)

    return () =>
      h(
        'pre',
        JSON.stringify({ panduan: matchedFor('/app/panduan'), jadwal: matchedFor('/app/jadwal') }),
      )
  },
})

describe('routing /app/panduan', () => {
  it('memakai halaman Panduan, bukan placeholder [feature].vue', async () => {
    const wrapper = await mountSuspended(RouteProbe)
    const result = JSON.parse(wrapper.text()) as {
      panduan: string[]
      jadwal: string[]
    }

    expect(result.panduan).toEqual(['/app/panduan'])
    // Fitur yang memang belum punya halaman tetap jatuh ke placeholder dinamis.
    expect(result.jadwal).toEqual(['/app/:feature()'])
  })
})
