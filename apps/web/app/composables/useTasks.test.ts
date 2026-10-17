import { beforeEach, describe, expect, it } from 'vitest'

import { emptyTaskDraft } from '~/utils/tasks'

import { useTasks } from './useTasks'

describe('useTasks', () => {
  beforeEach(() => {
    clearNuxtState(['tasks'])
  })

  it('tambah cepat, centang, kuadran, hapus', () => {
    const { tasks, add, toggle, setQuadrant, remove, findTask } = useTasks()
    const count = tasks.value.length
    expect(add('  ', 'low', null)).toBeNull()
    expect(add('Bayar listrik', 'urgent', null)).toEqual(expect.any(String))
    const created = tasks.value.at(-1)
    if (!created) throw new Error('task tidak dibuat')
    expect(tasks.value).toHaveLength(count + 1)

    toggle(created.id)
    setQuadrant(created.id, 'delegate')
    expect(findTask(created.id)).toMatchObject({ done: true, quadrant: 'delegate' })

    remove(created.id)
    expect(findTask(created.id)).toBeUndefined()
  })

  it('simpan dari form: error validasi atau buat/edit', () => {
    const { save, findTask } = useTasks()
    const draft = emptyTaskDraft('2026-10-10')
    expect(save(draft, null)).toEqual({ error: 'titleRequired' })
    const result = save({ ...draft, title: 'Rapat' }, null)
    if (!('id' in result)) throw new Error('gagal simpan')
    save({ ...draft, title: 'Rapat tim', priority: 'urgent' }, result.id)
    expect(findTask(result.id)).toMatchObject({ title: 'Rapat tim', priority: 'urgent' })
  })
})
