import { bucketForWidth, type DecoBucket } from '~/utils/deco'

import type { DecoScope } from './useDeco'

const BUCKET_QUERIES = ['(max-width: 599px)', '(max-width: 1024px)'] as const

/** Halaman + ukuran layar aktif: hiasan disimpan terpisah untuk tiap kombinasi. */
export function useDecoScope() {
  const route = useRoute()
  const bucket = ref<DecoBucket>(import.meta.client ? bucketForWidth(window.innerWidth) : 'desktop')

  // matchMedia, bukan event resize: callback cuma jalan saat melewati breakpoint.
  const sync = (): void => {
    bucket.value = bucketForWidth(window.innerWidth)
  }
  let queries: MediaQueryList[] = []
  onMounted(() => {
    queries = BUCKET_QUERIES.map((query) => window.matchMedia(query))
    queries.forEach((query) => query.addEventListener('change', sync))
    sync()
  })
  onBeforeUnmount(() => queries.forEach((query) => query.removeEventListener('change', sync)))

  const page = computed(() => {
    const feature = route.params.feature
    return typeof feature === 'string' && feature ? feature : 'home'
  })

  const scope = computed<DecoScope>(() => ({ page: page.value, bucket: bucket.value }))
  return { scope }
}
