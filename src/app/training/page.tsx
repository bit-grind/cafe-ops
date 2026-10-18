'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { useBranding } from '@/lib/useBranding'
import {
  createSignoffDeclaration,
  createTrainingModules,
  SIGNOFF_STANDARD,
  SIGNOFF_STANDARD_BOLD,
} from '@/lib/training/content'
import { DEFAULT_TRAINING_IDENTITY, normalizeTrainingIdentity } from '@/lib/training/identity'
import { completionSummary, isUnlocked } from '@/lib/training/progress'
import { slideGateCount } from '@/lib/training/types'
import type { ContentBlock, RichText, Slide, TrainingModule } from '@/lib/training/types'
import styles from './Training.module.css'

const TOKEN_KEY = 'bp_training_token'
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/

type Phase = 'loading' | 'nolink' | 'hub' | 'lesson' | 'quiz' | 'result'

type SlideState = {
  revealed: number[]
  ticked: number[]
  choiceSolved: number[]
  choiceWrong: Record<number, number[]>
  sortSolved: number[]
  sortWrong: string | null
}

const EMPTY_SLIDE_STATE: SlideState = {
  revealed: [],
  ticked: [],
  choiceSolved: [],
  choiceWrong: {},
  sortSolved: [],
  sortWrong: null,
}

/* ------------------------------------------------------------------ */
/* Rendering primitives                                                */
/* ------------------------------------------------------------------ */

function RichTextView({ text }: { text: RichText }) {
  if (typeof text === 'string') return <>{text}</>
  return (
    <>
      {text.map((run, i) => {
        if (typeof run === 'string') return <span key={i}>{run}</span>
        if ('strong' in run) return <span key={i} className={styles.strong}>{run.strong}</span>
        return <span key={i} className={styles.hl}>{run.hl}</span>
      })}
    </>
  )
}

function ContentBlockView({ block }: { block: ContentBlock }) {
  switch (block.kind) {
    case 'heading':
      return <h2 className={styles.h2}>{block.text}</h2>
    case 'para':
      return <p className={styles.p}><RichTextView text={block.text} /></p>
    case 'quote':
      return <p className={styles.quote}>{block.text}</p>
    case 'stat':
      return (
        <div className={styles.stat}>
          <div className={styles.statLabel}>{block.label}</div>
          <div className={styles.statValue}>{block.value}</div>
        </div>
      )
    case 'list':
      return (
        <ul className={styles.list}>
          {block.items.map((item, i) => (
            <li key={i}><span className={styles.listTick} aria-hidden="true">✓</span>{item}</li>
          ))}
        </ul>
      )
    case 'rank':
      return (
        <ol className={styles.rank}>
          {block.items.map((item, i) => (
            <li key={i} className={styles.rankItem}>
              <span className={styles.rankMarker} aria-hidden="true">{item.marker}</span>
              <span className={styles.rankTitle}>
                {item.title}
                <span className={styles.rankNote}>{item.note}</span>
              </span>
            </li>
          ))}
        </ol>
      )
    case 'roles':
      return (
        <div>
          {block.items.map((item, i) => (
            <div key={i} className={styles.role}>
              <div className={styles.roleIcon} aria-hidden="true">{item.icon}</div>
              <div>
                <h3 className={styles.roleTitle}>{item.title}</h3>
                <p className={styles.roleBody}><RichTextView text={item.body} /></p>
              </div>
            </div>
          ))}
        </div>
      )
    case 'oneline':
      return (
        <div className={styles.oneline}>
          <div className={styles.onelineLabel}>In one line</div>
          <div className={styles.onelineText}>{block.text}</div>
        </div>
      )
  }
}

/* ------------------------------------------------------------------ */
/* Slides                                                              */
/* ------------------------------------------------------------------ */

function SlideView({
  slide,
  state,
  setState,
}: {
  slide: Slide
  state: SlideState
  // Functional updates only: several of these controls can be tapped in quick
  // succession, and a snapshot-based setter loses all but the last one.
  setState: Dispatch<SetStateAction<SlideState>>
}) {
  if (slide.type === 'content') {
    return (
      <div className={styles.card}>
        <p className={styles.eyebrow}>{slide.kicker}</p>
        {slide.blocks.map((block, i) => <ContentBlockView key={i} block={block} />)}
      </div>
    )
  }

  if (slide.type === 'reveal') {
    return (
      <div className={styles.card}>
        <p className={styles.eyebrow}>{slide.kicker}</p>
        {slide.heading && <h2 className={styles.h2}>{slide.heading}</h2>}
        {slide.quote && <p className={styles.quote}>{slide.quote}</p>}
        {slide.intro && <p className={styles.p}><RichTextView text={slide.intro} /></p>}
        {slide.items.map((item, i) => {
          const open = state.revealed.includes(i)
          const classes = [styles.reveal]
          if (open) classes.push(styles.revealOpen)
          if (slide.emphasised) classes.push(styles.revealEmphasised)
          return (
            <div key={i} className={classes.join(' ')}>
              <button
                type="button"
                className={styles.revealHead}
                aria-expanded={open}
                onClick={() =>
                  setState(prev => ({
                    ...prev,
                    revealed: prev.revealed.includes(i)
                      ? prev.revealed.filter(n => n !== i)
                      : [...prev.revealed, i],
                  }))
                }
              >
                {item.icon && <span className={styles.revealIcon} aria-hidden="true">{item.icon}</span>}
                <span className={styles.revealTitle}>{item.title}</span>
                <span className={styles.revealChevron} aria-hidden="true">▾</span>
              </button>
              {open && <p className={styles.revealBody}><RichTextView text={item.body} /></p>}
            </div>
          )
        })}
      </div>
    )
  }

  if (slide.type === 'checklist') {
    return (
      <div className={styles.card}>
        <p className={styles.eyebrow}>{slide.kicker}</p>
        <h2 className={styles.h2}>{slide.heading}</h2>
        {slide.intro && <p className={styles.p}><RichTextView text={slide.intro} /></p>}
        {slide.items.map((item, i) => {
          const ticked = state.ticked.includes(i)
          return (
            <button
              key={i}
              type="button"
              aria-pressed={ticked}
              className={ticked ? `${styles.check} ${styles.checkTicked}` : styles.check}
              onClick={() =>
                setState(prev => ({
                  ...prev,
                  ticked: prev.ticked.includes(i)
                    ? prev.ticked.filter(n => n !== i)
                    : [...prev.ticked, i],
                }))
              }
            >
              <span className={styles.checkBox} aria-hidden="true">{ticked ? '✓' : ''}</span>
              <span>{item}</span>
            </button>
          )
        })}
      </div>
    )
  }

  if (slide.type === 'choice') {
    return (
      <div className={styles.card}>
        <p className={styles.eyebrow}>{slide.kicker}</p>
        <h2 className={styles.h2}>{slide.heading}</h2>
        {slide.intro && <p className={styles.p}><RichTextView text={slide.intro} /></p>}
        {slide.groups.map((group, gi) => {
          const solved = state.choiceSolved.includes(gi)
          const wrong = state.choiceWrong[gi] ?? []
          const lastWrong = wrong.length ? group.options[wrong[wrong.length - 1]] : null
          const correctOption = group.options.find(o => o.correct)
          return (
            <div key={gi} className={styles.choiceGroup}>
              <p className={styles.prompt}>{group.prompt}</p>
              <div className={styles.opts}>
                {group.options.map((option, oi) => {
                  const pickedWrong = wrong.includes(oi)
                  const showCorrect = solved && option.correct
                  const classes = [styles.opt]
                  if (showCorrect) classes.push(styles.optCorrect)
                  if (pickedWrong) classes.push(styles.optWrong)
                  return (
                    <button
                      key={oi}
                      type="button"
                      className={classes.join(' ')}
                      disabled={solved || pickedWrong}
                      onClick={() => {
                        if (option.correct) {
                          setState(prev => ({
                            ...prev,
                            choiceSolved: prev.choiceSolved.includes(gi)
                              ? prev.choiceSolved
                              : [...prev.choiceSolved, gi],
                          }))
                        } else {
                          setState(prev => ({
                            ...prev,
                            choiceWrong: {
                              ...prev.choiceWrong,
                              [gi]: [...(prev.choiceWrong[gi] ?? []), oi],
                            },
                          }))
                        }
                      }}
                    >
                      <span className={styles.optMark} aria-hidden="true">
                        {showCorrect ? '✓' : pickedWrong ? '✕' : ''}
                      </span>
                      <span>{option.text}</span>
                    </button>
                  )
                })}
              </div>
              {solved && correctOption && (
                <p className={`${styles.feedback} ${styles.feedbackOk}`}>{correctOption.feedback}</p>
              )}
              {!solved && lastWrong && (
                <p className={`${styles.feedback} ${styles.feedbackNo}`}>{lastWrong.feedback}</p>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  // sort
  return (
    <div className={styles.card}>
      <p className={styles.eyebrow}>{slide.kicker}</p>
      <h2 className={styles.h2}>{slide.heading}</h2>
      {slide.intro && <p className={styles.p}><RichTextView text={slide.intro} /></p>}
      {slide.items.map((item, ii) => {
        const solved = state.sortSolved.includes(ii)
        return (
          <div key={ii} className={solved ? `${styles.sortItem} ${styles.sortSolved}` : styles.sortItem}>
            <div className={styles.sortText}>{item.text}</div>
            <div className={styles.sortOpts}>
              {slide.buckets.map((bucket, bi) => {
                const right = solved && bi === item.bucket
                const shaking = state.sortWrong === `${ii}:${bi}`
                const classes = [styles.sortBtn]
                if (right) classes.push(styles.sortBtnRight)
                if (shaking) classes.push(styles.sortBtnWrong)
                return (
                  <button
                    key={bi}
                    type="button"
                    className={classes.join(' ')}
                    disabled={solved}
                    onClick={() => {
                      if (bi === item.bucket) {
                        setState(prev => ({
                          ...prev,
                          sortSolved: prev.sortSolved.includes(ii)
                            ? prev.sortSolved
                            : [...prev.sortSolved, ii],
                          sortWrong: null,
                        }))
                      } else {
                        setState(prev => ({ ...prev, sortWrong: `${ii}:${bi}` }))
                      }
                    }}
                  >
                    {bucket}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function solvedCount(slide: Slide, state: SlideState): number {
  switch (slide.type) {
    case 'content':
      return 0
    case 'reveal':
      return state.revealed.length
    case 'checklist':
      return state.ticked.length
    case 'choice':
      return state.choiceSolved.length
    case 'sort':
      return state.sortSolved.length
  }
}


/* ------------------------------------------------------------------ */
/* Celebration                                                         */
/* ------------------------------------------------------------------ */

const CONFETTI_COLOURS = ['#4E9BD8', '#2B6098', '#E79B3C', '#2F8D63', '#DBEAF8']

/**
 * Carried over from the course your team member wrote — it fires on every
 * module pass and again at sign-off. Runs for three seconds and clears itself.
 */
function fireConfetti(canvas: HTMLCanvasElement | null) {
  if (!canvas) return
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  canvas.width = window.innerWidth
  canvas.height = window.innerHeight

  const pieces = Array.from({ length: 120 }, () => ({
    x: Math.random() * canvas.width,
    y: -20 - Math.random() * canvas.height * 0.4,
    size: 5 + Math.random() * 7,
    vx: -2 + Math.random() * 4,
    vy: 2 + Math.random() * 4,
    angle: Math.random() * Math.PI * 2,
    spin: -0.2 + Math.random() * 0.4,
    colour: CONFETTI_COLOURS[Math.floor(Math.random() * CONFETTI_COLOURS.length)],
  }))

  let start: number | null = null
  function frame(now: number) {
    if (start === null) start = now
    ctx!.clearRect(0, 0, canvas!.width, canvas!.height)
    for (const p of pieces) {
      p.x += p.vx
      p.y += p.vy
      p.vy += 0.05
      p.angle += p.spin
      ctx!.save()
      ctx!.translate(p.x, p.y)
      ctx!.rotate(p.angle)
      ctx!.fillStyle = p.colour
      ctx!.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.5)
      ctx!.restore()
    }
    if (now - start < 3000) requestAnimationFrame(frame)
    else ctx!.clearRect(0, 0, canvas!.width, canvas!.height)
  }
  requestAnimationFrame(frame)
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function TrainingPage() {
  const branding = useBranding()
  const [identity, setIdentity] = useState(DEFAULT_TRAINING_IDENTITY)
  const modules = useMemo(() => createTrainingModules(identity), [identity])
  const declaration = useMemo(() => createSignoffDeclaration(identity), [identity])

  const [phase, setPhase] = useState<Phase>('loading')
  const [token, setToken] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [completedIds, setCompletedIds] = useState<string[]>([])
  const [signedOffAt, setSignedOffAt] = useState<string | null>(null)
  const [signedOffName, setSignedOffName] = useState<string | null>(null)

  const [moduleIdx, setModuleIdx] = useState(0)
  const [slideIdx, setSlideIdx] = useState(0)
  const [slideState, setSlideState] = useState<SlideState>(EMPTY_SLIDE_STATE)
  const [quizIdx, setQuizIdx] = useState(0)
  const [quizScore, setQuizScore] = useState(0)
  const [quizPick, setQuizPick] = useState<number | null>(null)

  const [saveError, setSaveError] = useState<string | null>(null)
  const [signName, setSignName] = useState('')
  const [signError, setSignError] = useState<string | null>(null)
  const [signBusy, setSignBusy] = useState(false)

  const confettiRef = useRef<HTMLCanvasElement | null>(null)

  const currentModule: TrainingModule | undefined = modules[moduleIdx]
  const summary = useMemo(() => completionSummary(completedIds), [completedIds])

  // The page is the only light surface in a dark app; the body background is
  // set inline in the root layout, so override it while this page is mounted.
  useEffect(() => {
    const previous = document.body.style.background
    document.body.style.background = '#f4f7fa'
    return () => { document.body.style.background = previous }
  }, [])

  const authFetch = useCallback(
    (url: string, init?: RequestInit) =>
      fetch(url, {
        ...init,
        headers: {
          ...(init?.headers ?? {}),
          'x-training-token': token ?? '',
          ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        },
      }),
    [token],
  )

  // Take the token from the URL fragment (scrubbing it from the address bar),
  // fall back to the copy cached on this device, then let the server decide.
  // A missing or unknown token comes back 401 and lands on the same screen, so
  // there is only one path to get wrong.
  useEffect(() => {
    let alive = true

    function readStoredToken(): string | null {
      const fromHash = window.location.hash.replace(/^#/, '')
      if (TOKEN_PATTERN.test(fromHash)) {
        try { window.localStorage.setItem(TOKEN_KEY, fromHash) } catch { /* private mode */ }
        window.history.replaceState(null, '', window.location.pathname)
        return fromHash
      }
      try {
        const cached = window.localStorage.getItem(TOKEN_KEY)
        return cached && TOKEN_PATTERN.test(cached) ? cached : null
      } catch {
        return null
      }
    }

    async function boot() {
      const stored = readStoredToken()
      try {
        const res = await fetch('/api/training/me', {
          headers: { 'x-training-token': stored ?? '' },
        })
        if (!alive) return
        if (!res.ok) {
          try { window.localStorage.removeItem(TOKEN_KEY) } catch { /* private mode */ }
          setPhase('nolink')
          return
        }
        const data = await res.json()
        if (!alive) return
        setIdentity(normalizeTrainingIdentity(data.identity))
        setToken(stored)
        setName(data.name ?? '')
        setSignName(data.signedOffName ?? data.name ?? '')
        setCompletedIds((data.completed ?? []).map((c: { moduleId: string }) => c.moduleId))
        setSignedOffAt(data.signedOffAt ?? null)
        setSignedOffName(data.signedOffName ?? null)
        setPhase('hub')
      } catch {
        if (alive) setPhase('nolink')
      }
    }

    void boot()
    return () => { alive = false }
  }, [])

  function openModule(index: number) {
    setModuleIdx(index)
    setSlideIdx(0)
    setSlideState(EMPTY_SLIDE_STATE)
    setQuizIdx(0)
    setQuizScore(0)
    setQuizPick(null)
    setSaveError(null)
    setPhase('lesson')
    window.scrollTo({ top: 0 })
  }

  function goHub() {
    setPhase('hub')
    window.scrollTo({ top: 0 })
  }

  async function saveModule(module: TrainingModule, score: number) {
    setSaveError(null)
    try {
      const res = await authFetch('/api/training/progress', {
        method: 'POST',
        body: JSON.stringify({ moduleId: module.id, score }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        setSaveError(json.error ?? 'Could not save your progress')
        return
      }
      setCompletedIds(prev => (prev.includes(module.id) ? prev : [...prev, module.id]))
    } catch {
      setSaveError('Could not save your progress — check your connection')
    }
  }

  async function submitSignoff() {
    const trimmed = signName.trim()
    if (!trimmed) {
      setSignError('Enter your full name first')
      return
    }
    setSignBusy(true)
    setSignError(null)
    try {
      const res = await authFetch('/api/training/signoff', {
        method: 'POST',
        body: JSON.stringify({ fullName: trimmed }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setSignError(json.error ?? 'Could not complete your sign-off')
        return
      }
      setSignedOffAt(json.signedOffAt ?? new Date().toISOString())
      setSignedOffName(json.signedOffName ?? trimmed)
      fireConfetti(confettiRef.current)
    } catch {
      setSignError('Could not complete your sign-off — check your connection')
    } finally {
      setSignBusy(false)
    }
  }

  /* ---- gate / loading states ---- */

  if (phase === 'loading') {
    return (
      <div className={styles.page}>
        <div className={styles.wrap}>
          <div className={styles.centered}>
            <div className={styles.card}><p>Loading your training…</p></div>
          </div>
        </div>
      </div>
    )
  }

  if (phase === 'nolink') {
    return (
      <div className={styles.page}>
        <div className={styles.wrap}>
          <div className={styles.centered}>
            <div className={styles.card}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={branding.logoSrc} alt={`${branding.displayName} logo`} />
              <h1>You need your own training link</h1>
              <p>
                This training opens from a personal link. Ask your manager to send you
                yours — it saves your progress as you go, so you can stop and pick it
                up later on any phone.
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  /* ---- shared chrome ---- */

  const headerPercent =
    phase === 'hub'
      ? summary.percent
      : phase === 'lesson' && currentModule
        ? Math.round((slideIdx / currentModule.slides.length) * 60)
        : phase === 'quiz' && currentModule
          ? 60 + Math.round((quizIdx / currentModule.quiz.length) * 35)
          : 100

  const headerLabel =
    phase === 'hub'
      ? 'Home'
      : currentModule
        ? `Module ${moduleIdx + 1} · ${phase === 'quiz' ? 'Quick check' : currentModule.title}`
        : ''

  const chrome = (children: React.ReactNode) => (
    <div className={styles.page}>
      <canvas className={styles.confetti} ref={confettiRef} aria-hidden="true" />
      <div className={styles.wrap}>
        <div className={styles.top}>
          <div className={styles.brandRow}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={branding.logoSrc} alt={`${branding.displayName} logo`} />
            <div className={styles.brandName}>
              {branding.displayName}
              <span>Team training</span>
            </div>
          </div>
          <div className={styles.progressTrack}>
            <div className={styles.progressFill} style={{ width: `${headerPercent}%` }} />
          </div>
          <p className={styles.progressLabel}>{headerLabel}</p>
        </div>
        {children}
        <p className={styles.footer}>
          {branding.displayName} · {identity.footerLocation} · Est. 2010
          <br />
          Fast, funky &amp; fresh — customers first, coffee second, food third.
        </p>
      </div>
    </div>
  )

  /* ---- hub ---- */

  if (phase === 'hub') {
    return chrome(
      <>
        <div className={styles.hubHead}>
          <h1>
            {summary.allComplete
              ? `You’re ${identity.readinessName} ready, ${name.split(' ')[0]}`
              : `Welcome, ${name.split(' ')[0]}`}
          </h1>
          <p>
            {summary.allComplete
              ? 'Every module complete. Finish up with your sign-off below.'
              : 'Work through each module in order. Everything here comes up on your very first shift.'}
          </p>
        </div>

        <div className={styles.hubProgress}>
          <div className={styles.hubProgressValue}>
            {summary.done}<span> / {summary.total}</span>
          </div>
          <div className={styles.hubProgressBar}>
            <i style={{ width: `${summary.percent}%` }} />
          </div>
          <div className={styles.hubProgressLabel}>Modules complete</div>
        </div>

        <div className={styles.sectionLabel}>Modules</div>
        <div className={styles.modList}>
          {modules.map((module, i) => {
            const done = completedIds.includes(module.id)
            const unlocked = isUnlocked(module.id, completedIds)
            const isNext = unlocked && !done
            const classes = [styles.modCard]
            if (done) classes.push(styles.modDone)
            if (isNext) classes.push(styles.modCardNext)
            return (
              <button
                key={module.id}
                type="button"
                className={classes.join(' ')}
                disabled={!unlocked}
                onClick={() => openModule(i)}
              >
                <span className={styles.modIcon} aria-hidden="true">{module.icon}</span>
                <span className={styles.modBody}>
                  <span className={styles.modNumber}>Module {i + 1}</span>
                  <span className={styles.modTitle}>{module.title}</span>
                  <span className={styles.modBlurb}>
                    <span className={styles.modPill}>{module.tag}</span>
                    {module.blurb}
                  </span>
                </span>
                <span
                  className={done ? `${styles.modStatus} ${styles.modStatusDone}` : styles.modStatus}
                  aria-hidden="true"
                >
                  {done ? '✓' : unlocked ? '→' : '🔒'}
                </span>
              </button>
            )
          })}
        </div>

        {summary.allComplete && (
          <div className={styles.card} style={{ marginTop: 20 }}>
            <p className={styles.eyebrow}>{identity.businessName} standard</p>
            <div className={styles.standard}>
              {SIGNOFF_STANDARD}
              <b>{SIGNOFF_STANDARD_BOLD}</b>
            </div>
            <h2 className={styles.h2}>Sign-off</h2>
            <p className={styles.p}>{declaration}</p>

            <div className={styles.field}>
              <label htmlFor="signoff-name">Full name</label>
              <input
                id="signoff-name"
                className={styles.input}
                type="text"
                autoComplete="name"
                value={signedOffAt ? (signedOffName ?? signName) : signName}
                disabled={!!signedOffAt || signBusy}
                onChange={e => { setSignName(e.target.value); setSignError(null) }}
              />
            </div>

            {signedOffAt ? (
              <div className={styles.signedPill}>
                ✓ Onboarding complete — welcome aboard, {(signedOffName ?? name).split(' ')[0]}
              </div>
            ) : (
              <div className={styles.nav}>
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnPrimary}`}
                  onClick={() => void submitSignoff()}
                  disabled={signBusy}
                >
                  {signBusy ? 'Saving…' : 'Complete my onboarding'}
                </button>
              </div>
            )}
            {signError && <p className={styles.error}>{signError}</p>}
          </div>
        )}
      </>,
    )
  }

  if (!currentModule) return chrome(<div className={styles.card}><p>Module not found.</p></div>)

  /* ---- lesson ---- */

  if (phase === 'lesson') {
    const slide = currentModule.slides[slideIdx]
    const need = slideGateCount(slide)
    const done = solvedCount(slide, slideState)
    const canContinue = need === 0 || done >= need
    const isLastSlide = slideIdx === currentModule.slides.length - 1

    return chrome(
      <>
        <button type="button" className={styles.backLink} onClick={goHub}>← All modules</button>
        <SlideView slide={slide} state={slideState} setState={setSlideState} />

        <div className={styles.dots}>
          {currentModule.slides.map((_, i) => (
            <span key={i} className={i === slideIdx ? `${styles.dot} ${styles.dotOn}` : styles.dot} />
          ))}
        </div>

        {!canContinue && (
          <p className={styles.gateHint}>
            Finish this step to continue — {done} of {need} done
          </p>
        )}

        <div className={styles.nav}>
          {slideIdx > 0 && (
            <button
              type="button"
              className={styles.btn}
              onClick={() => {
                setSlideIdx(slideIdx - 1)
                setSlideState(EMPTY_SLIDE_STATE)
                window.scrollTo({ top: 0 })
              }}
            >
              Back
            </button>
          )}
          <button
            type="button"
            className={`${styles.btn} ${styles.btnPrimary}`}
            disabled={!canContinue}
            onClick={() => {
              if (isLastSlide) {
                setPhase('quiz')
              } else {
                setSlideIdx(slideIdx + 1)
                setSlideState(EMPTY_SLIDE_STATE)
              }
              window.scrollTo({ top: 0 })
            }}
          >
            {isLastSlide ? 'Quick check →' : 'Continue →'}
          </button>
        </div>
      </>,
    )
  }

  /* ---- quiz ---- */

  if (phase === 'quiz') {
    const question = currentModule.quiz[quizIdx]
    const answered = quizPick !== null
    const isLastQuestion = quizIdx === currentModule.quiz.length - 1

    return chrome(
      <>
        <button type="button" className={styles.backLink} onClick={goHub}>← All modules</button>
        <div className={styles.quizCount}>
          <span>Quick check · {quizIdx + 1} of {currentModule.quiz.length}</span>
          <span>Score {quizScore}</span>
        </div>

        <div className={styles.card}>
          <p className={styles.quizQuestion}>{question.question}</p>
          <div className={styles.opts}>
            {question.answers.map((answer, i) => {
              const showCorrect = answered && i === question.correct
              const showWrong = answered && i === quizPick && i !== question.correct
              const classes = [styles.opt]
              if (showCorrect) classes.push(styles.optCorrect)
              if (showWrong) classes.push(styles.optWrong)
              return (
                <button
                  key={i}
                  type="button"
                  className={classes.join(' ')}
                  disabled={answered}
                  onClick={() => {
                    setQuizPick(i)
                    if (i === question.correct) setQuizScore(quizScore + 1)
                  }}
                >
                  <span className={styles.optMark} aria-hidden="true">
                    {showCorrect ? '✓' : showWrong ? '✕' : ''}
                  </span>
                  <span>{answer}</span>
                </button>
              )
            })}
          </div>
          {answered && (
            <p
              className={
                quizPick === question.correct
                  ? `${styles.feedback} ${styles.feedbackOk}`
                  : `${styles.feedback} ${styles.feedbackNo}`
              }
            >
              {quizPick === question.correct
                ? 'Correct'
                : 'Not quite — the right answer is highlighted.'}
            </p>
          )}
        </div>

        <div className={styles.nav}>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnPrimary}`}
            disabled={!answered}
            onClick={() => {
              if (isLastQuestion) {
                const finalScore = quizScore
                setPhase('result')
                if (finalScore === currentModule.quiz.length) {
                  void saveModule(currentModule, finalScore)
                  fireConfetti(confettiRef.current)
                }
              } else {
                setQuizIdx(quizIdx + 1)
                setQuizPick(null)
              }
              window.scrollTo({ top: 0 })
            }}
          >
            {isLastQuestion ? 'See results →' : 'Next question →'}
          </button>
        </div>
      </>,
    )
  }

  /* ---- result ---- */

  const total = currentModule.quiz.length
  const passed = quizScore === total
  const hasNext = moduleIdx < modules.length - 1

  return chrome(
    <>
      <div className={`${styles.card} ${styles.result}`}>
        <div className={passed ? styles.seal : `${styles.seal} ${styles.sealFail}`} aria-hidden="true">
          {passed ? '✓' : '↺'}
        </div>
        <p className={styles.eyebrow} style={{ marginBottom: 6 }}>
          Module {moduleIdx + 1} · {passed ? 'Complete' : 'Not passed'}
        </p>
        <h2 className={styles.h2}>
          {passed ? `${currentModule.title} — nailed it` : 'So close!'}
        </h2>
        <p className={styles.p}>
          {passed
            ? currentModule.blurb
            : `You need all ${total} correct to pass this module. No worries — run through it again from the top and give it another go.`}
        </p>
        <div className={styles.resultScore}>
          {quizScore}<span> / {total}</span>
        </div>
        <div className={styles.resultLabel}>Quick check</div>
        {saveError && <p className={styles.error}>{saveError}</p>}
      </div>

      <div className={styles.nav}>
        {passed ? (
          saveError ? (
            <button
              type="button"
              className={`${styles.btn} ${styles.btnPrimary}`}
              onClick={() => void saveModule(currentModule, quizScore)}
            >
              Try saving again
            </button>
          ) : hasNext ? (
            <button
              type="button"
              className={`${styles.btn} ${styles.btnPrimary}`}
              onClick={() => openModule(moduleIdx + 1)}
            >
              Next module →
            </button>
          ) : (
            <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={goHub}>
              Finish &amp; sign off →
            </button>
          )
        ) : (
          <button
            type="button"
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={() => openModule(moduleIdx)}
          >
            ↺ Back to the start of the module
          </button>
        )}
        <button type="button" className={styles.btn} onClick={goHub}>All modules</button>
      </div>
    </>,
  )
}
