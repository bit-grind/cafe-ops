import { describe, it, expect } from 'vitest'
import { TRAINING_MODULES } from '@/lib/training/content'
import { slideGateCount } from '@/lib/training/types'

/**
 * The course was transcribed from a standalone HTML file — 10 modules, 44
 * slides, 28 quiz questions. These are cheap structural checks that catch a
 * transcription slip (a quiz with no right answer, a sort item pointing at a
 * bucket that doesn't exist) long before a new starter hits it on their phone.
 */

describe('course shape', () => {
  it('has the ten modules the course was built around', () => {
    expect(TRAINING_MODULES).toHaveLength(10)
    expect(TRAINING_MODULES.map(m => m.id)).toEqual([
      'welcome', 'customers', 'neverno', 'coffee', 'etiquette',
      'food', 'efficiency', 'seeitownit', 'teamwork', 'learn',
    ])
  })

  it('carries the full slide and question count', () => {
    expect(TRAINING_MODULES.reduce((n, m) => n + m.slides.length, 0)).toBe(44)
    expect(TRAINING_MODULES.reduce((n, m) => n + m.quiz.length, 0)).toBe(28)
  })

  it('has unique module ids', () => {
    const ids = TRAINING_MODULES.map(m => m.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('every module', () => {
  it.each(TRAINING_MODULES.map(m => [m.id, m] as const))('%s is complete and answerable', (_id, module) => {
    expect(module.title.trim()).not.toBe('')
    expect(module.blurb.trim()).not.toBe('')
    expect(module.tag.trim()).not.toBe('')
    expect(module.icon.trim()).not.toBe('')
    expect(module.slides.length).toBeGreaterThan(0)
    expect(module.quiz.length).toBeGreaterThan(0)

    for (const q of module.quiz) {
      expect(q.question.trim()).not.toBe('')
      expect(q.answers.length).toBeGreaterThanOrEqual(2)
      // A correct index outside the answer list makes the module unpassable.
      expect(q.correct).toBeGreaterThanOrEqual(0)
      expect(q.correct).toBeLessThan(q.answers.length)
      expect(new Set(q.answers).size).toBe(q.answers.length)
      for (const a of q.answers) expect(a.trim()).not.toBe('')
    }
  })
})

describe('interactive slides', () => {
  const slides = TRAINING_MODULES.flatMap(m => m.slides.map(s => [m.id, s] as const))

  it('every choice group has exactly one correct option with feedback on both', () => {
    for (const [moduleId, slide] of slides) {
      if (slide.type !== 'choice') continue
      for (const group of slide.groups) {
        const correct = group.options.filter(o => o.correct)
        expect(correct, `${moduleId}: "${group.prompt}"`).toHaveLength(1)
        expect(group.options.length).toBeGreaterThanOrEqual(2)
        for (const o of group.options) {
          expect(o.text.trim()).not.toBe('')
          expect(o.feedback.trim(), `${moduleId}: "${o.text}"`).not.toBe('')
        }
      }
    }
  })

  it('every sort item points at a bucket that exists', () => {
    for (const [moduleId, slide] of slides) {
      if (slide.type !== 'sort') continue
      expect(slide.buckets.length).toBeGreaterThanOrEqual(2)
      for (const item of slide.items) {
        expect(item.bucket, `${moduleId}: "${item.text}"`).toBeGreaterThanOrEqual(0)
        expect(item.bucket, `${moduleId}: "${item.text}"`).toBeLessThan(slide.buckets.length)
      }
    }
  })

  it('every checklist and reveal has items to work through', () => {
    for (const [moduleId, slide] of slides) {
      if (slide.type !== 'checklist' && slide.type !== 'reveal') continue
      expect(slide.items.length, moduleId).toBeGreaterThan(0)
    }
  })

  it('content slides never gate the continue button, interactive ones always do', () => {
    for (const [moduleId, slide] of slides) {
      const gate = slideGateCount(slide)
      if (slide.type === 'content') expect(gate, moduleId).toBe(0)
      else expect(gate, `${moduleId}/${slide.type}`).toBeGreaterThan(0)
    }
  })

  it('every content slide has at least one block', () => {
    for (const [moduleId, slide] of slides) {
      if (slide.type !== 'content') continue
      expect(slide.blocks.length, moduleId).toBeGreaterThan(0)
    }
  })
})
