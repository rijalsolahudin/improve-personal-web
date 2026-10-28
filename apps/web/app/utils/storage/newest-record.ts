type DataRecord = { readonly id: string; readonly data: unknown }

function updatedAtOf(data: unknown): number {
  if (typeof data !== 'object' || data === null) return 0
  const value = (data as Record<string, unknown>)['updatedAt']
  return typeof value === 'number' ? value : 0
}

/**
 * Record singleton terbaru (menurut `data.updatedAt`).
 *
 * Record singleton per akun (preferensi, profil) bisa sempat dobel kalau dua perangkat membuatnya
 * sebelum sync pertama - yang paling baru yang dipakai.
 */
export function newestRecord<T extends DataRecord>(records: readonly T[]): T | null {
  return records.reduce<T | null>((newest, record) => {
    if (newest === null) return record
    return updatedAtOf(record.data) > updatedAtOf(newest.data) ? record : newest
  }, null)
}
