import {
  createSystemClock,
  type GoalChapter as CoreChapter,
  type Goal as CoreGoal,
} from '@improve-personal/core'

import {
  applyGoalDraft,
  toggleTaskItem,
  validateGoalDraft,
  type Chapter,
  type Goal,
  type GoalDraft,
  type GoalDraftError,
} from '~/utils/goals'
import {
  loadGoalRecords,
  persistGoal,
  recordsToPresentations,
  removeGoal,
  toCoreChapters,
  toCoreGoal,
  type GoalPresentationSources,
  type GoalRecords,
} from '~/utils/goals/persistence'
import type { LocalDataSession } from '~/utils/storage/session'
import { createUuidV7Generator } from '~/utils/storage/uuid'
import { toIsoDate } from '~/utils/time'

import { useGoalLinks } from './useGoalLinks'
import { useHabits } from './useHabits'
import { useLocalData } from './useLocalData'
import { useSchedules } from './useSchedules'
import { useTasks } from './useTasks'

/**
 * Data Goals (PRD F13).
 *
 * Sumber data = record core (`goal`, `goal_chapter`, `goal_link`) di penyimpanan terenkripsi, bukan
 * data contoh. Progress tidak dihitung ulang di sini: item disusun dari tautan + data mentah, lalu
 * persennya memakai primitif core (`utils/goals.ts`), jadi angka web = angka mobile.
 *
 * Bentuk API tetap sinkron seperti fase mock (`goals`, `save`, `remove`, `setCover`, `updateChapter`,
 * `toggleTask`) karena form & halaman Goals sudah memakainya; penulisan berjalan di belakang antrean.
 */
export type UseGoalsOptions = {
  readonly session?: () => Promise<LocalDataSession | null>
}

/** Cermin sesi untuk `clearNuxtState` (simulasi reload) & test composable. */
let cachedGoals: Goal[] | null = null
let hydrateInFlight: Promise<void> | null = null
let writeQueue: Promise<void> = Promise.resolve()

export function resetGoalsHydrationForTest(): void {
  cachedGoals = null
  hydrateInFlight = null
  writeQueue = Promise.resolve()
}

export function useGoals(options: UseGoalsOptions = {}) {
  const localData = useLocalData()
  const getSession = options.session ?? localData.ensure
  const sourceOptions = options.session ? { session: options.session } : {}

  const goalLinks = useGoalLinks({ session: getSession })
  const taskStore = useTasks(sourceOptions)
  const habitStore = useHabits(sourceOptions)
  const scheduleStore = useSchedules(sourceOptions)

  const now = useNow()
  const today = computed(() => toIsoDate(new Date(now.value)))
  const goals = useState<Goal[]>('goals', () => cachedGoals ?? [])
  const records = useState<GoalRecords>('goalRecords', () => ({
    goals: [],
    chapters: [],
  }))
  const status = useState<'idle' | 'loading' | 'ready' | 'error'>('goalsStatus', () => 'idle')
  const error = useState<string | null>('goalsError', () => null)

  const newGoalId = createUuidV7Generator({ clock: createSystemClock() })

  function presentationSources(): GoalPresentationSources {
    return {
      tasks: taskStore.tasks.value,
      habits: [...habitStore.activeHabits.value, ...habitStore.archivedHabits.value],
      checkIns: habitStore.checkIns.value,
      schedules: scheduleStore.schedules.value,
      attendance: scheduleStore.attendance.value,
    }
  }

  function rebuild(): void {
    goals.value = recordsToPresentations(
      records.value,
      goalLinks.links.value,
      presentationSources(),
      today.value,
    )
    cachedGoals = goals.value
  }

  function hydrate(): Promise<void> {
    if (status.value === 'ready') return Promise.resolve()

    hydrateInFlight ??= (async () => {
      status.value = 'loading'
      try {
        const session = await getSession()
        if (session === null) {
          // SSR / sesi terkunci: daftar kosong, bukan data contoh.
          status.value = 'idle'
          return
        }

        await Promise.all([
          taskStore.hydrate(),
          habitStore.hydrate(),
          scheduleStore.hydrate(),
          goalLinks.hydrate(),
        ])

        const loaded = await loadGoalRecords(session)
        const local = new Map(goals.value.map((goal) => [goal.id, goal] as const))
        const presentations = recordsToPresentations(
          loaded,
          goalLinks.links.value,
          presentationSources(),
          today.value,
        )

        // Tulisan yang terjadi selama hydrate menang; sisanya mengikuti penyimpanan.
        records.value = loaded
        goals.value = [
          ...presentations.map((goal) => local.get(goal.id) ?? goal),
          ...[...local.values()].filter(
            (goal) => !presentations.some((candidate) => candidate.id === goal.id),
          ),
        ]
        cachedGoals = goals.value
        status.value = 'ready'
        error.value = null
      } catch (cause) {
        status.value = 'error'
        error.value = cause instanceof Error ? cause.message : 'goal tidak bisa dimuat'
        hydrateInFlight = null
      }
    })()

    return hydrateInFlight
  }

  function findGoal(id: string | null | undefined): Goal | undefined {
    return id ? goals.value.find((goal) => goal.id === id) : undefined
  }

  function applyToRecords(goal: Goal): void {
    const nowMs = Date.now()
    const previousGoal: CoreGoal | undefined = records.value.goals.find(
      (candidate) => candidate.id === goal.id,
    )
    const previousChapters = new Map<string, CoreChapter>(
      records.value.chapters
        .filter((chapter) => chapter.goalId === goal.id)
        .map((chapter) => [chapter.id, chapter] as const),
    )
    const nextGoal = toCoreGoal(goal, nowMs, previousGoal)
    const nextChapters = toCoreChapters(goal, nowMs, previousChapters)

    records.value = {
      goals: previousGoal
        ? records.value.goals.map((candidate) => (candidate.id === goal.id ? nextGoal : candidate))
        : [nextGoal, ...records.value.goals],
      chapters: [
        ...records.value.chapters.filter((chapter) => chapter.goalId !== goal.id),
        ...nextChapters,
      ],
    }
  }

  function enqueue(work: (session: LocalDataSession) => Promise<void>): void {
    writeQueue = writeQueue.then(async () => {
      try {
        const session = await getSession()
        if (session === null) return
        await work(session)
        error.value = null
      } catch (cause) {
        status.value = 'error'
        error.value = cause instanceof Error ? cause.message : 'goal tidak bisa disimpan'
      }
    })
    void writeQueue
  }

  function persist(goal: Goal): void {
    enqueue(async (session) => {
      const result = await persistGoal(session, goal)
      for (const link of result.reassignedLinks) {
        goalLinks.apply(link.itemType, link.itemId, link)
      }
    })
  }

  /** Simpan draft form. Mengembalikan id goal, atau kode error validasi. */
  function save(
    draft: GoalDraft,
    editId: string | null,
  ): { id: string } | { error: GoalDraftError } {
    const draftError = validateGoalDraft(draft)
    if (draftError) return { error: draftError }

    const base = findGoal(editId) ?? null
    const saved = applyGoalDraft(draft, base, newGoalId)
    goals.value = base
      ? goals.value.map((goal) => (goal.id === saved.id ? saved : goal))
      : [saved, ...goals.value]
    cachedGoals = goals.value
    applyToRecords(saved)
    persist(saved)
    return { id: saved.id }
  }

  function update(id: string, change: (goal: Goal) => Goal): void {
    const updated = goals.value.find((goal) => goal.id === id)
    if (!updated) return
    const next = change(updated)
    goals.value = goals.value.map((goal) => (goal.id === id ? next : goal))
    cachedGoals = goals.value
    applyToRecords(next)
    persist(next)
  }

  /** Hapus goal; item tertaut tetap ada di fitur asalnya (PRD: tautan dilepas). */
  function remove(id: string): void {
    goals.value = goals.value.filter((goal) => goal.id !== id)
    cachedGoals = goals.value
    records.value = {
      goals: records.value.goals.filter((goal) => goal.id !== id),
      chapters: records.value.chapters.filter((chapter) => chapter.goalId !== id),
    }
    enqueue(async (session) => {
      await removeGoal(session, id)
      for (const link of goalLinks.links.value.filter((item) => item.goalId === id)) {
        goalLinks.apply(link.itemType, link.itemId, null)
      }
    })
  }

  function setCover(id: string, cover: string | null): void {
    update(id, (goal) => ({ ...goal, cover }))
  }

  function updateChapter(goalId: string, chapterId: string, change: (c: Chapter) => Chapter): void {
    update(goalId, (goal) => ({
      ...goal,
      chapters: goal.chapters.map((chapter) =>
        chapter.id === chapterId ? change(chapter) : chapter,
      ),
    }))
  }

  /** Centang task: state task asli ikut berubah supaya progress sesudah reload konsisten. */
  function toggleTask(goalId: string, chapterId: string | null, itemId: string): void {
    const task = taskStore.findTask(itemId)
    if (task !== undefined) {
      taskStore.toggle(itemId)
      return
    }

    if (chapterId) {
      updateChapter(goalId, chapterId, (chapter) => ({
        ...chapter,
        items: toggleTaskItem(chapter.items, itemId),
      }))
    } else {
      update(goalId, (goal) => ({ ...goal, along: toggleTaskItem(goal.along, itemId) }))
    }
  }

  // Item/habit/jadwal yang berubah (termasuk dari centang di halaman lain) memperbarui angka goal.
  watch(
    [
      () => records.value,
      () => goalLinks.links.value,
      () => taskStore.tasks.value,
      () => habitStore.habits.value,
      () => habitStore.checkIns.value,
      () => scheduleStore.schedules.value,
      () => scheduleStore.attendance.value,
    ],
    () => {
      // Tanpa goal tidak ada yang perlu dihitung; hindari kerja pada setiap check-in/task.
      if (status.value === 'ready' && records.value.goals.length > 0) rebuild()
    },
    { deep: true },
  )

  watch(
    () => localData.state.value.status,
    (next) => {
      if (next === 'ready') void hydrate()
    },
  )

  // Ganti akun tanpa reload halaman: jangan tampilkan goal akun sebelumnya.
  watch(
    () => localData.state.value.userId,
    (next, previous) => {
      if (next === previous || next === null) return
      cachedGoals = null
      goals.value = []
      records.value = { goals: [], chapters: [] }
      status.value = 'idle'
      hydrateInFlight = null
      void hydrate()
    },
  )

  // Di server ini tidak melakukan apa pun (sesi `null`), dan `status` tetap `idle`.
  void hydrate()

  return {
    goals: computed(() => goals.value),
    today,
    status: computed(() => status.value),
    error: computed(() => error.value),
    hydrate,
    findGoal,
    save,
    remove,
    setCover,
    updateChapter,
    toggleTask,
  }
}
