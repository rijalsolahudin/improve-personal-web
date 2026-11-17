import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'

import { useFieldError } from '~/composables/useFieldError'

type Err = 'titleRequired' | 'dateOrder' | 'persist'
type Fld = 'title' | 'date'

const FIELD_OF: Record<Err, Fld | null> = {
  titleRequired: 'title',
  dateOrder: 'date',
  persist: null,
}

async function mountHost() {
  const error = ref<Err | null>(null)
  let api: ReturnType<typeof useFieldError<Err, Fld>> | undefined
  const Host = defineComponent({
    setup() {
      api = useFieldError(error, FIELD_OF)
      return () => h('div')
    },
  })
  await mountSuspended(Host)
  if (!api) throw new Error('useFieldError tidak terpasang')
  return { error, api }
}

describe('useFieldError', () => {
  it('tanpa error: tidak ada kolom yang invalid dan tidak ada error umum', async () => {
    const { api } = await mountHost()

    expect(api.errorField.value).toBeNull()
    expect(api.generalError.value).toBeNull()
    expect(api.isInvalid('title')).toBe(false)
    expect(api.describedBy('title')).toBeUndefined()
  })

  it('error milik kolom: hanya kolom itu yang invalid dan menunjuk ke id pesan', async () => {
    const { error, api } = await mountHost()

    error.value = 'dateOrder'
    await nextTick()

    expect(api.errorField.value).toBe('date')
    expect(api.isInvalid('date')).toBe(true)
    expect(api.isInvalid('title')).toBe(false)
    expect(api.describedBy('date')).toBe(api.errorId)
    expect(api.describedBy('title')).toBeUndefined()
    expect(api.generalError.value).toBeNull()
  })

  it('error tanpa kolom jadi error umum, tidak menandai kolom mana pun', async () => {
    const { error, api } = await mountHost()

    error.value = 'persist'
    await nextTick()

    expect(api.generalError.value).toBe('persist')
    expect(api.errorField.value).toBeNull()
    expect(api.isInvalid('title')).toBe(false)
    expect(api.isInvalid('date')).toBe(false)
  })

  it('id pesan stabil dan tidak kosong, supaya aria-describedby selalu valid', async () => {
    const { error, api } = await mountHost()
    const id = api.errorId

    error.value = 'titleRequired'
    await nextTick()

    expect(id).toBeTruthy()
    expect(api.describedBy('title')).toBe(id)
  })
})
