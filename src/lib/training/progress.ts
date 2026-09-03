import { TRAINING_MODULES } from './content'
import type { TrainingModule } from './types'

export type ModuleResult = { moduleId: string; bestScore: number; total: number }

/** Every module id in course order. */
export const MODULE_IDS: string[] = TRAINING_MODULES.map(m => m.id)

export function findModule(moduleId: string): TrainingModule | undefined {
  return TRAINING_MODULES.find(m => m.id === moduleId)
}

export function moduleIndex(moduleId: string): number {
  return TRAINING_MODULES.findIndex(m => m.id === moduleId)
}

/**
 * A module passes only on full marks. The original course worked this way and
 * it is deliberate — these are short quizzes on things that matter on the
 * floor, so "close enough" isn't a pass.
 */
export function hasPassed(score: number, total: number): boolean {
  return total > 0 && score === total
}

/**
 * The authoritative quiz length for a module. Routes must use this rather
 * than a client-supplied total, or a trainee could post `score: 1, total: 1`
 * and pass every module.
 */
export function quizTotal(moduleId: string): number | null {
  return findModule(moduleId)?.quiz.length ?? null
}

/** Modules unlock in order: the first is always open, the rest need the previous one done. */
export function isUnlocked(moduleId: string, completedIds: readonly string[]): boolean {
  const index = moduleIndex(moduleId)
  if (index < 0) return false
  if (index === 0) return true
  return completedIds.includes(TRAINING_MODULES[index - 1].id)
}

/** The next module a trainee should open, or null when everything is done. */
export function nextModuleId(completedIds: readonly string[]): string | null {
  const next = TRAINING_MODULES.find(m => !completedIds.includes(m.id))
  return next?.id ?? null
}

export function completionSummary(completedIds: readonly string[]): {
  done: number
  total: number
  percent: number
  allComplete: boolean
} {
  // Ignore ids that are no longer part of the course, so retiring a module
  // can never report 11 of 10 complete.
  const done = TRAINING_MODULES.filter(m => completedIds.includes(m.id)).length
  const total = TRAINING_MODULES.length
  return {
    done,
    total,
    percent: total === 0 ? 0 : Math.round((done / total) * 100),
    allComplete: done === total,
  }
}

/** True when every module in the current course has been passed. */
export function isCourseComplete(completedIds: readonly string[]): boolean {
  return completionSummary(completedIds).allComplete
}
