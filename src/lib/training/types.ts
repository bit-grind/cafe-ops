/**
 * Shape of the staff onboarding course.
 *
 * The course was authored as a standalone HTML file whose "content" slides
 * carried raw HTML strings written against that file's stylesheet. Rendering
 * it inside the ops app meant restyling, so the prose is modelled as blocks
 * here and rendered as components — nothing in this module reaches the DOM
 * through `dangerouslySetInnerHTML`.
 *
 * Copy is transcribed verbatim from the original. `content.test.ts` guards
 * the structural invariants across all 44 slides.
 */

/** An inline run of prose. Plain strings cover the common case. */
export type Run = string | { strong: string } | { hl: string }

/** Prose that may carry inline emphasis. A bare string means "no emphasis". */
export type RichText = string | Run[]

export type ContentBlock =
  /** Section heading inside a slide. */
  | { kind: 'heading'; text: string }
  | { kind: 'para'; text: RichText }
  /** Oversized figure with a label above it, e.g. "Established / 2010". */
  | { kind: 'stat'; label: string; value: string }
  /** Ticked list of short points. */
  | { kind: 'list'; items: string[] }
  /** Ordered priorities, where the marker is not always a number ("∞"). */
  | { kind: 'rank'; items: Array<{ marker: string; title: string; note: string }> }
  /** Named roles with an icon and a description. */
  | { kind: 'roles'; items: Array<{ icon: string; title: string; body: RichText }> }
  /** The "In one line" summary that closes most modules. */
  | { kind: 'oneline'; text: string }
  /** Pull quote, set larger and centred. */
  | { kind: 'quote'; text: string }

export type RevealItem = { icon: string; title: string; body: RichText }

export type ChoiceOption = { text: string; correct: boolean; feedback: string }

export type ChoiceGroup = { prompt: string; options: ChoiceOption[] }

export type Slide =
  | { type: 'content'; kicker: string; blocks: ContentBlock[] }
  | {
      type: 'reveal'
      kicker: string
      heading?: string
      intro?: RichText
      /** Pull quote shown above the items, in place of an intro paragraph. */
      quote?: string
      /** The "See It, Own It, Act" slide, which reverses the item styling. */
      emphasised?: boolean
      items: RevealItem[]
    }
  | { type: 'choice'; kicker: string; heading: string; intro?: RichText; groups: ChoiceGroup[] }
  | { type: 'checklist'; kicker: string; heading: string; intro?: RichText; items: string[] }
  | {
      type: 'sort'
      kicker: string
      heading: string
      intro?: RichText
      buckets: string[]
      items: Array<{ text: string; bucket: number }>
    }

export type QuizQuestion = { question: string; answers: string[]; correct: number }

export type TrainingModule = {
  id: string
  icon: string
  title: string
  /** Short label for the interaction style, shown as a pill on the hub. */
  tag: string
  blurb: string
  slides: Slide[]
  quiz: QuizQuestion[]
}

/**
 * Slides that gate the Continue button until the learner has worked through
 * every item on them. Content slides have nothing to interact with.
 */
export function isInteractiveSlide(slide: Slide): boolean {
  return slide.type !== 'content'
}

/** Number of interactions a slide requires before the learner may continue. */
export function slideGateCount(slide: Slide): number {
  switch (slide.type) {
    case 'content':
      return 0
    case 'reveal':
      return slide.items.length
    case 'choice':
      return slide.groups.length
    case 'checklist':
      return slide.items.length
    case 'sort':
      return slide.items.length
  }
}
