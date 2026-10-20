import { pomodoroSessionSchema, type PomodoroSession } from '@improve-personal/core'

import type { FocusSession } from '../pomodoro'
import { createRepository } from '../storage/repository'
import type { LocalDataSession } from '../storage/session'
import { MS_PER_DAY } from '../time'

/**
 * Persistensi riwayat Pomodoro: `FocusSession` (UI) <-> record `pomodoro_session`.
 *
 * Yang disimpan hanya sesi yang sudah selesai/dilewati. Pengaturan timer tetap di localStorage
 * karena itu preferensi tampilan, bukan data yang perlu ikut sinkron; riwayat ini yang dipakai
 * Overview (F11), jadi harus persisten dan ikut backup.
 *
 * Target disimpan sebagai `free_text`: model UI hanya memegang label, bukan id task. Saat target
 * benar-benar ditautkan ke todo (butuh id), pemetaan `targetType: 'todo'` bisa ditambahkan tanpa
 * mengubah bentuk record.
 */

const HISTORY_DAYS = 180
const TARGET_MAX = 500
const DEFAULT_TARGET = 'Fokus'

function repository(session: LocalDataSession) {
  return createRepository<PomodoroSession>(session, 'pomodoro_session')
}

function toFocusSession(record: PomodoroSession, nowMs: number): FocusSession {
  return {
    id: record.id,
    startedAt: record.startedAt,
    endedAt: record.endedAt ?? nowMs,
    target: record.targetText ?? DEFAULT_TARGET,
    status: record.status === 'completed' ? 'selesai' : 'dilewati',
  }
}

/** Riwayat sesi terbaru (maks 180 hari), urut terbaru dulu. */
export async function loadFocusSessions(
  session: LocalDataSession,
  nowMs: number,
): Promise<FocusSession[]> {
  const records = await repository(session).listByRange({
    fromMs: nowMs - HISTORY_DAYS * MS_PER_DAY,
    toMs: nowMs,
    order: 'desc',
  })

  return records
    .map((record) => pomodoroSessionSchema.parse(record.data))
    .filter((record) => record.endedAt !== null)
    .map((record) => toFocusSession(record, nowMs))
    .sort((a, b) => b.startedAt - a.startedAt)
}

/** Simpan satu sesi yang baru selesai/dilewati. */
export async function persistFocusSession(
  session: LocalDataSession,
  focus: FocusSession,
): Promise<void> {
  const endedAt = focus.endedAt
  const target = focus.target.trim().slice(0, TARGET_MAX) || DEFAULT_TARGET

  await session.writer.write({
    id: focus.id,
    type: 'pomodoro_session',
    data: () => ({
      id: focus.id,
      startedAt: focus.startedAt,
      endedAt,
      actualDurationMs: Math.max(0, endedAt - focus.startedAt),
      targetType: 'free_text',
      targetTodoId: null,
      targetText: target,
      status: focus.status === 'selesai' ? 'completed' : 'skipped',
    }),
    index: { rangeStartMs: focus.startedAt, rangeEndMs: null },
  })
}
