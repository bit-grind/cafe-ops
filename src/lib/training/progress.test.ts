import { describe, it, expect } from 'vitest'
import { TRAINING_MODULES } from '@/lib/training/content'
import {
  MODULE_IDS,
  completionSummary,
  hasPassed,
  isCourseComplete,
  isUnlocked,
  moduleIndex,
  nextModuleId,
  quizTotal,
} from '@/lib/training/progress'

const ALL = MODULE_IDS

describe('hasPassed', () => {
  it('requires full marks', () => {
    expect(hasPassed(3, 3)).toBe(true)
    expect(hasPassed(2, 3)).toBe(false)
    expect(hasPassed(0, 3)).toBe(false)
  })

  it('never passes a zero-length quiz', () => {
    expect(hasPassed(0, 0)).toBe(false)
  })
})

describe('quizTotal', () => {
  it('reports the real quiz length so routes never trust a client total', () => {
    expect(quizTotal('welcome')).toBe(3)
    expect(quizTotal('neverno')).toBe(2)
  })

  it('returns null for an unknown module', () => {
    expect(quizTotal('nope')).toBeNull()
  })
})

describe('isUnlocked', () => {
  it('opens the first module to a trainee who has done nothing', () => {
    expect(isUnlocked(ALL[0], [])).toBe(true)
  })

  it('keeps later modules locked until the previous one is passed', () => {
    expect(isUnlocked(ALL[1], [])).toBe(false)
    expect(isUnlocked(ALL[1], [ALL[0]])).toBe(true)
  })

  it('does not unlock a module just because a later one was somehow completed', () => {
    expect(isUnlocked(ALL[2], [ALL[0], ALL[3]])).toBe(false)
  })

  it('rejects an unknown module id', () => {
    expect(isUnlocked('nope', ALL)).toBe(false)
  })
})

describe('nextModuleId', () => {
  it('points at the first module for a fresh trainee', () => {
    expect(nextModuleId([])).toBe(ALL[0])
  })

  it('skips completed modules', () => {
    expect(nextModuleId([ALL[0], ALL[1]])).toBe(ALL[2])
  })

  it('returns null once the course is finished', () => {
    expect(nextModuleId(ALL)).toBeNull()
  })
})

describe('completionSummary', () => {
  it('counts progress against the current course', () => {
    expect(completionSummary([ALL[0], ALL[1]])).toEqual({
      done: 2,
      total: TRAINING_MODULES.length,
      percent: 20,
      allComplete: false,
    })
  })

  it('ignores ids that are no longer part of the course', () => {
    // A retired module left on an old record must not report 11 of 10.
    const summary = completionSummary([...ALL, 'retired-module'])
    expect(summary.done).toBe(TRAINING_MODULES.length)
    expect(summary.allComplete).toBe(true)
  })

  it('does not count a duplicate id twice', () => {
    expect(completionSummary([ALL[0], ALL[0]]).done).toBe(1)
  })
})

describe('isCourseComplete', () => {
  it('is false while anything is outstanding', () => {
    expect(isCourseComplete(ALL.slice(0, -1))).toBe(false)
  })

  it('is true only when every module is passed', () => {
    expect(isCourseComplete(ALL)).toBe(true)
  })
})

describe('moduleIndex', () => {
  it('reflects course order', () => {
    expect(moduleIndex(ALL[0])).toBe(0)
    expect(moduleIndex('nope')).toBe(-1)
  })
})
