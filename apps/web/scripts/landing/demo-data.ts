import { randomBytes } from 'node:crypto'

import {
  buildBackupDocument,
  createHlcGenerator,
  serializeBackup,
  validateBackupText,
  type BackupRecordInput,
  type EntityType,
} from '@improve-personal/core'

/**
 * Data contoh untuk screenshot landing (`scripts/landing/shots.ts`).
 *
 * Semua tanggal relatif terhadap HARI INI di zona `DEMO_TZ`, supaya Daily, kalender, dan streak
 * selalu terlihat "hidup" kapan pun screenshot diambil ulang. Dokumen yang dihasilkan divalidasi
 * dengan `validateBackupText` - skema yang sama dengan import di app - sebelum dipakai.
 */

export const DEMO_TZ = 'Asia/Jakarta'

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
const MINUTE_MS = 60 * 1000
/** WIB = UTC+7, tanpa DST. */
const TZ_OFFSET_MS = 7 * HOUR_MS

/** Indeks `SCHEDULE_COLORS` di app (disimpan sebagai string di `schedule.color`). */
const PALETTE = {
  purple: '0',
  orange: '1',
  green: '2',
  blue: '3',
  pink: '4',
  yellow: '5',
  red: '6',
}

/** UUID v7 (RFC 9562): 48 bit waktu + versi 7 + varian 10. */
function uuidv7(atMs: number): string {
  const bytes = randomBytes(16)
  bytes.writeUIntBE(atMs, 0, 6)
  bytes[6] = 0x70 | ((bytes[6] ?? 0) & 0x0f)
  bytes[8] = 0x80 | ((bytes[8] ?? 0) & 0x3f)
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function buildDemoBackup(nowMs: number): string {
  const startOfToday = Math.floor((nowMs + TZ_OFFSET_MS) / DAY_MS) * DAY_MS - TZ_OFFSET_MS
  /** Epoch ms untuk jam lokal pada hari ke-`dayOffset` dari hari ini. */
  const at = (dayOffset: number, hour: number, minute = 0): number =>
    startOfToday + dayOffset * DAY_MS + hour * HOUR_MS + minute * MINUTE_MS
  const localDate = (dayOffset: number): string =>
    new Date(startOfToday + dayOffset * DAY_MS + TZ_OFFSET_MS).toISOString().slice(0, 10)

  const created = at(-30, 8)
  let idClock = created
  const id = (): string => uuidv7((idClock += 1))

  const hlc = createHlcGenerator({
    deviceId: uuidv7(created),
    clock: { nowMs: () => nowMs, monotonicMs: () => nowMs },
  })
  const records: BackupRecordInput[] = []
  const add = (type: EntityType, data: { readonly id: string }): string => {
    records.push({ id: data.id, type, hlc: hlc.tick(), deleted: false, data })
    return data.id
  }

  add('user_profile', { id: id(), displayName: 'Rina', avatar: null, updatedAt: created })

  // Jadwal: rutin harian, mingguan, dan sekali - mengisi kalender & Daily.
  const once = { type: 'once' as const, intervalN: 1, byWeekdays: null }
  const recurrence = (
    scheduleId: string,
    rule: { type: 'once' | 'daily' | 'weekly'; intervalN: number; byWeekdays: string[] | null },
  ) => ({
    id: id(),
    scheduleId,
    ...rule,
    monthMode: null,
    monthDay: null,
    weekOfMonth: null,
    monthWeekday: null,
    endMode: 'never',
    endDate: null,
    occurrenceCount: null,
  })
  const schedule = (
    title: string,
    startAt: number,
    durationMin: number,
    color: string,
    rule: Parameters<typeof recurrence>[1],
  ): string => {
    const scheduleId = id()
    return add('schedule', {
      id: scheduleId,
      title,
      description: null,
      color,
      startAt,
      durationMs: durationMin * MINUTE_MS,
      isAllDay: false,
      tz: DEMO_TZ,
      createdAt: created,
      updatedAt: created,
      recurrence: recurrence(scheduleId, rule),
    })
  }

  schedule('Olahraga pagi', at(-30, 6), 45, PALETTE.green, {
    type: 'daily',
    intervalN: 1,
    byWeekdays: null,
  })
  schedule('Deep work: desain', at(-30, 9), 120, PALETTE.purple, {
    type: 'weekly',
    intervalN: 1,
    byWeekdays: ['senin', 'selasa', 'rabu', 'kamis', 'jumat'],
  })
  const standup = schedule('Stand-up tim', at(-30, 13), 30, PALETTE.blue, {
    type: 'weekly',
    intervalN: 1,
    byWeekdays: ['senin', 'rabu', 'jumat'],
  })
  schedule('Kelas bahasa Jepang', at(-30, 19), 90, PALETTE.orange, {
    type: 'weekly',
    intervalN: 1,
    byWeekdays: ['selasa', 'kamis'],
  })
  schedule('Makan siang bareng Dina', at(0, 12), 60, PALETTE.pink, once)
  schedule('Review portofolio', at(2, 15), 60, PALETTE.yellow, once)
  schedule('Dokter gigi', at(5, 10), 45, PALETTE.red, once)

  // To-do + kuadran Eisenhower.
  const todos: { title: string; deadline: number | null; priority: string; done: boolean }[] = [
    { title: 'Kirim proposal ke klien', deadline: at(0, 17), priority: 'urgent', done: false },
    { title: 'Siapkan slide presentasi Q4', deadline: at(1, 10), priority: 'urgent', done: false },
    { title: 'Bayar tagihan listrik', deadline: at(0, 20), priority: 'medium', done: true },
    { title: 'Baca 20 halaman "Atomic Habits"', deadline: at(0, 22), priority: 'low', done: false },
    { title: 'Update CV & LinkedIn', deadline: at(4, 18), priority: 'medium', done: false },
    { title: 'Belanja mingguan', deadline: at(1, 18), priority: 'low', done: false },
    { title: 'Balas email Pak Budi', deadline: at(0, 11), priority: 'medium', done: true },
    { title: 'Riset tiket liburan Desember', deadline: null, priority: 'low', done: false },
  ]
  const quadrants = ['do', 'do', 'delegate', 'schedule', 'schedule', 'delegate', 'do', 'delete']
  todos.forEach((todo, index) => {
    const todoId = add('todo', {
      id: id(),
      title: todo.title,
      note: null,
      deadlineAt: todo.deadline,
      priority: todo.priority,
      isDone: todo.done,
      completedAt: todo.done ? at(0, 9 + index) : null,
      scheduleId: null,
      scheduleOccurrenceAt: null,
      createdAt: created,
      updatedAt: created,
    })
    add('eisenhower_placement', {
      id: id(),
      todoId,
      quadrant: quadrants[index] ?? 'do',
      position: index,
      createdAt: created,
    })
  })

  // Habit dengan check-in 30 hari terakhir (pola realistis: sesekali bolong).
  const habits = [
    {
      name: 'Minum 8 gelas air',
      sticker: 'aktivitas/kopi',
      color: '#0A55E6',
      target: 8,
      skip: [11, 19],
    },
    {
      name: 'Olahraga 30 menit',
      sticker: 'aktivitas/olahraga',
      color: '#1DA20F',
      target: 1,
      skip: [13, 20, 27],
    },
    { name: 'Meditasi', sticker: 'aktivitas/meditasi', color: '#9B4FC9', target: 1, skip: [9, 16] },
    {
      name: 'Tidur sebelum jam 11',
      sticker: 'aktivitas/tidur',
      color: '#FF6A13',
      target: 1,
      skip: [7, 14, 22],
    },
  ]
  for (const habit of habits) {
    const habitId = add('habit', {
      id: id(),
      name: habit.name,
      iconSticker: habit.sticker,
      color: habit.color,
      frequencyType: 'daily',
      frequencyDays: null,
      targetPerDay: habit.target,
      isArchived: false,
      createdAt: created,
      updatedAt: created,
    })
    for (let day = -29; day <= 0; day += 1) {
      if (habit.skip.includes(-day)) continue
      // Hari ini baru sebagian: gelas air 5/8.
      const amount = day === 0 && habit.target > 1 ? 5 : habit.target
      add('habit_checkin', {
        id: id(),
        habitId,
        localDate: localDate(day),
        amount,
        checkinAt: at(day, 21),
      })
    }
  }

  // Jurnal 2 minggu terakhir dengan mood bervariasi.
  const moods = [
    'bahagia',
    'sangat_bahagia',
    'netral',
    'bahagia',
    'sedih',
    'bahagia',
    'sangat_bahagia',
  ]
  for (let day = -13; day <= 0; day += 1) {
    const entryId = add('journal_entry', {
      id: id(),
      entryDate: localDate(day),
      identityToday: day === 0 ? 'Orang yang menyelesaikan apa yang dia mulai.' : null,
      mood: moods[(day + 13) % moods.length] ?? 'netral',
      moodStoryMd: day === 0 ? 'Presentasi tadi lancar, tim kasih masukan yang bagus.' : null,
      diaryMd:
        day === 0
          ? 'Pagi lari 5 km, lanjut deep work dua jam tanpa distraksi. Siang makan bareng Dina, ngobrolin rencana liburan. Malam lanjut baca *Atomic Habits* - bab soal identitas kena banget.'
          : 'Hari yang cukup produktif. Satu langkah kecil tetap langkah.',
      createdAt: at(day, 21),
      updatedAt: at(day, 21),
    })
    if (day === 0) {
      const reflections: [string, string][] = [
        ['bersyukur', 'Badan sehat dan bisa olahraga pagi'],
        ['bersyukur', 'Tim yang suportif'],
        ['bisa_lebih_baik', 'Kurangi scroll HP sebelum tidur'],
      ]
      reflections.forEach(([kind, text], position) =>
        add('journal_reflection', { id: id(), entryId, kind, text, position }),
      )
      add('journal_affirmation', {
        id: id(),
        entryId,
        text: 'Aku cukup, dan aku terus bertumbuh.',
        position: 0,
      })
      add('journal_sticker', {
        id: id(),
        entryId,
        stickerId: 'mood/semangat',
        position: 0,
        x: 0.86,
        line: 1,
        rotate: 8,
        scale: 1,
      })
    }
  }

  // Goals dengan chapter + tautan item.
  const goal = (
    title: string,
    reason: string,
    category: string,
    sticker: string,
    chapters: [string, number, number, boolean][],
  ): string => {
    const goalId = add('goal', {
      id: id(),
      title,
      reason,
      category,
      coverSticker: sticker,
      startDate: localDate(-60),
      targetDate: localDate(120),
      status: 'aktif',
      createdAt: created,
      updatedAt: created,
    })
    chapters.forEach(([chapterTitle, from, to, done], sortOrder) =>
      add('goal_chapter', {
        id: id(),
        goalId,
        title: chapterTitle,
        startDate: localDate(from),
        endDate: localDate(to),
        sortOrder,
        isCompleted: done,
        isClosed: false,
        createdAt: created,
        updatedAt: created,
      }),
    )
    return goalId
  }

  const careerGoal = goal(
    'Jadi Product Designer senior',
    'Mau memimpin proyek desain sendiri.',
    'karier',
    'kerja/roket',
    [
      ['Rapikan portofolio', -60, -20, true],
      ['Ambil 2 proyek lintas tim', -19, 40, false],
      ['Lamar posisi senior', 41, 120, false],
    ],
  )
  add('goal_link', {
    id: id(),
    goalId: careerGoal,
    chapterId: null,
    itemType: 'schedule',
    itemId: standup,
    createdAt: created,
  })
  goal('Lari 10K pertama', 'Biar badan lebih bugar dan kuat.', 'kesehatan', 'aktivitas/olahraga', [
    ['Lari 3 km rutin', -60, -30, true],
    ['Naik ke 5 km', -29, 20, false],
    ['Latihan 10K', 21, 120, false],
  ])
  goal('Dana darurat 6 bulan', 'Tenang kalau ada apa-apa.', 'keuangan', 'perayaan/piala', [
    ['Nabung 3 bulan pertama', -60, 30, false],
    ['Genapkan 6 bulan', 31, 120, false],
  ])

  // Countdown.
  const countdowns: [string, number, string, string][] = [
    ['Liburan ke Jepang', at(38, 7), 'perjalanan/pesawat', '#10A8D8'],
    ['Ulang tahun Ibu', at(12, 0), 'perayaan/kue', '#F03FBF'],
    ['Deadline proyek Q4', at(9, 17), 'perayaan/piala', '#9B4FC9'],
  ]
  for (const [name, targetAt, sticker, color] of countdowns) {
    add('countdown', {
      id: id(),
      name,
      targetAt,
      color,
      stickerId: sticker,
      isYearly: false,
      isAllDay: false,
      isArchived: false,
      archivedAt: null,
      createdAt: created,
      updatedAt: created,
    })
  }

  // Sesi Pomodoro seminggu terakhir untuk statistik fokus.
  for (let day = -6; day <= 0; day += 1) {
    const sessions = day === 0 ? 3 : 2 + ((day + 6) % 3)
    for (let index = 0; index < sessions; index += 1) {
      const startedAt = at(day, 9, index * 30)
      add('pomodoro_session', {
        id: id(),
        startedAt,
        endedAt: startedAt + 25 * MINUTE_MS,
        actualDurationMs: 25 * MINUTE_MS,
        targetType: 'free_text',
        targetTodoId: null,
        targetText: 'Deep work: desain',
        status: 'completed',
      })
    }
  }

  const text = serializeBackup(buildBackupDocument({ records, exportedAtMs: nowMs }))
  const validation = validateBackupText(text)
  if (!validation.ok) {
    throw new Error(
      `data contoh tidak lolos validasi: ${JSON.stringify(validation).slice(0, 2_000)}`,
    )
  }
  return text
}
