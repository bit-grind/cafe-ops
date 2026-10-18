import { describe, expect, it } from 'vitest'
import { createSignoffDeclaration, createTrainingModules, TRAINING_MODULES } from './content'
import { DEFAULT_TRAINING_IDENTITY, normalizeTrainingIdentity, parseTrainingIdentity } from './identity'

describe('training identity configuration', () => {
  it('falls back safely for missing, malformed or non-object configuration', () => {
    for (const raw of [undefined, '', '{', 'null', '[]', '42']) {
      expect(parseTrainingIdentity(raw)).toEqual(DEFAULT_TRAINING_IDENTITY)
    }
  })

  it('accepts display text only and omits unrelated private fields', () => {
    expect(normalizeTrainingIdentity({
      businessName: '  Sample Coffee  ',
      shortName: '',
      readinessName: null,
      founderName: 23,
      footerLocation: '  High Street  ',
      serviceKey: 'must never be forwarded',
    })).toEqual({
      ...DEFAULT_TRAINING_IDENTITY,
      businessName: 'Sample Coffee',
      footerLocation: 'High Street',
    })
  })

  it('personalizes course copy while preserving server grading and unlock structure', () => {
    const identity = parseTrainingIdentity(JSON.stringify({
      businessName: 'Sample Coffee',
      shortName: 'Sample',
      readinessName: 'Sample Coffee',
      founderName: 'Jamie Example',
      footerLocation: 'High Street',
    }))
    const modules = createTrainingModules(identity)
    const gradingShape = (course: typeof modules) => course.map(module => ({
      id: module.id,
      slides: module.slides.map(slide => slide.type),
      quiz: module.quiz.map(question => ({
        answerCount: question.answers.length,
        correct: question.correct,
      })),
    }))

    expect(gradingShape(modules)).toEqual(gradingShape(TRAINING_MODULES))
    expect(modules[0].title).toBe('Welcome to Sample Coffee')
    expect(modules[0].quiz[1].answers[0]).toBe('Jamie Example')
    expect(JSON.stringify(modules)).toContain('the Sample mindset')
    expect(createSignoffDeclaration(identity)).toContain('member of Sample Coffee team')
    expect(createTrainingModules()).toEqual(TRAINING_MODULES)
  })
})
