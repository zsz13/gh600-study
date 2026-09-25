import { useEffect, useMemo, useRef, useState } from 'react'
import type { FlatQuestion } from '../types'
import { isCorrect, shuffle } from '../lib/exam'

interface QuestionCardProps {
  question: FlatQuestion
  index: number
  total: number
  mode: 'study' | 'mock'
  initialAnswer?: string
  showSolutionInitially?: boolean
  onAnswer?: (qid: string, given: string, correct: boolean) => void
  onNext?: () => void
  onPrev?: () => void
  onFlag?: (qid: string) => void
  flagged?: boolean
  canPrev?: boolean
}

const DIFF_LABEL: Record<string, string> = {
  easy: 'easy',
  medium: 'medium',
  hard: 'hard',
}

const TYPE_LABEL: Record<string, string> = {
  multiple_choice: 'Single answer',
  multi_select: 'Multi-select (count is in the question)',
  drag_drop_order: 'Order the steps',
  fill_blank: 'Fill in the blank',
  match_pairs: 'Match pairs',
  case_study: 'Case study (check context above)',
}

// The answer an ordering question starts from: what the list shows is what gets checked,
// and it is never already solved.
function scrambledOrder(question: FlatQuestion): string {
  const order = shuffle(question.options ?? [])
  const joined = order.join(' -> ')
  if (order.length > 1 && isCorrect(question, joined)) return [...order.slice(1), order[0]].join(' -> ')
  return joined
}

// Next, Previous and a mock save remount the card (parents key it by question id), which drops
// keyboard focus on <body>. The outgoing card flags the handoff and the next card to mount clears
// it, taking focus only if focus really was lost, so a stray flag can never steal focus.
let focusIncomingCard = false
const focusLost = () => document.activeElement === document.body

export default function QuestionCard({
  question,
  index,
  total,
  mode,
  initialAnswer,
  showSolutionInitially,
  onAnswer,
  onNext,
  onPrev,
  onFlag,
  flagged,
  canPrev,
}: QuestionCardProps) {
  // Parents key this card by question id, so state starts fresh for every question.
  const [answer, setAnswer] = useState<string>(
    () => initialAnswer ?? (question.type === 'drag_drop_order' ? scrambledOrder(question) : ''),
  )
  // Graded in study mode. A mock never reveals: saving records the answer and moves on.
  const [revealed, setRevealed] = useState<boolean>(!!showSolutionInitially)
  const saved = mode === 'mock' && !!answer && answer === initialAnswer
  const headingRef = useRef<HTMLHeadingElement>(null)
  const verdictRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handoff = focusIncomingCard
    focusIncomingCard = false
    if (handoff && focusLost()) headingRef.current?.focus()
  }, [])

  // "Check answer" unmounts once graded; land focus on the verdict instead of <body>.
  useEffect(() => {
    if (revealed && focusLost()) verdictRef.current?.focus()
  }, [revealed])

  const navigate = (go?: () => void) => {
    if (!go) return
    focusIncomingCard = true
    go()
  }
  const isLast = index >= total - 1

  const correct = useMemo(
    () => (answer ? isCorrect(question, answer) : false),
    [answer, question],
  )

  const submit = (given = answer) => {
    if (!given) return
    onAnswer?.(question.id, given, isCorrect(question, given))
    if (mode === 'study') setRevealed(true)
    else if (!isLast) navigate(onNext)
  }

  const selfMark = (matched: boolean) => {
    if (revealed) return
    const given = matched ? 'self-correct' : 'self-wrong'
    setAnswer(given)
    if (mode === 'study') submit(given)
  }

  const optionLetter = (i: number) => String.fromCharCode(65 + i)
  const isLetter = (raw: string, letter: string) => {
    if (question.type === 'multi_select') {
      const set = new Set(raw.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean))
      return set.has(letter)
    }
    return raw.trim().toUpperCase() === letter
  }

  const toggleLetter = (letter: string) => {
    if (revealed) return
    if (question.type === 'multi_select') {
      const set = new Set(answer.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean))
      if (set.has(letter)) set.delete(letter)
      else set.add(letter)
      setAnswer(Array.from(set).sort().join(','))
    } else {
      setAnswer(letter)
    }
  }

  const correctLetters = (question.correct || '')
    .split(',')
    .map((s) => s.trim().toUpperCase())

  return (
    <article className="card p-6 fade-up">
      <header className="flex flex-wrap items-center gap-2 mb-4">
        <div className="chip chip-accent">
          {index + 1} / {total}
        </div>
        <div className="chip">D{question.domainId} · {question.objectiveId}</div>
        <div className="chip">{TYPE_LABEL[question.type] ?? question.type}</div>
        {question.difficulty && (
          <div
            className={`chip ${
              question.difficulty === 'easy'
                ? 'chip-good'
                : question.difficulty === 'medium'
                ? 'chip-warn'
                : 'chip-bad'
            }`}
          >
            {DIFF_LABEL[question.difficulty] ?? question.difficulty}
          </div>
        )}
        <div className="flex-1" />
        {onFlag && (
          <button
            onClick={() => onFlag(question.id)}
            className={`btn btn-ghost text-xs ${flagged ? 'text-accent' : ''}`}
            aria-pressed={!!flagged}
            title="Flag to review later"
          >
            {flagged ? '⚑ Flagged' : '⚐ Flag'}
          </button>
        )}
      </header>

      <h2
        ref={headingRef}
        tabIndex={-1}
        className="text-lg font-display text-ink leading-relaxed whitespace-pre-line mb-4 scroll-mt-28"
      >
        {question.stem}
      </h2>

      {/* Multiple choice & multi_select & case_study sub option list */}
      {(question.type === 'multiple_choice' ||
        question.type === 'multi_select' ||
        (question.type === 'case_study' && question.options)) && question.options && (
        <ul className="space-y-2">
          {question.options.map((opt, i) => {
            const letter = optionLetter(i)
            const labelMatch = opt.match(/^([A-Z])\.\s*/)
            const usedLetter = labelMatch ? labelMatch[1] : letter
            const isPicked = isLetter(answer, usedLetter)
            const isCorrectOpt = correctLetters.includes(usedLetter)
            const showState = revealed
            const tone = showState
              ? isCorrectOpt
                ? 'border-good/60 bg-good/10'
                : isPicked
                ? 'border-bad/60 bg-bad/10'
                : 'border-line'
              : isPicked
              ? 'border-accent bg-accent/10'
              : 'border-line hover:border-line-strong'
            return (
              <li key={i}>
                <button
                  onClick={() => toggleLetter(usedLetter)}
                  className={`w-full text-left border rounded-lg p-3 flex gap-3 transition enabled:cursor-pointer ${tone}`}
                  aria-pressed={isPicked}
                  disabled={revealed}
                >
                  <div
                    className={`shrink-0 w-7 h-7 rounded-md font-mono font-semibold grid place-items-center text-sm ${
                      isPicked
                        ? 'bg-accent text-bg'
                        : 'bg-bg-3 text-ink-dim border border-line-strong'
                    }`}
                  >
                    {usedLetter}
                  </div>
                  <div className="text-sm text-ink-dim leading-relaxed">{opt.replace(/^[A-Z]\.\s*/, '')}</div>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {question.type === 'drag_drop_order' && question.options && (
        <DragDropOrder
          value={answer}
          revealed={revealed}
          correct={question.correct}
          onChange={setAnswer}
        />
      )}

      {question.type === 'fill_blank' && (
        <div>
          <input
            type="text"
            placeholder="Type your answer…"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            disabled={revealed}
            aria-label="Your answer"
            className="w-full font-mono"
          />
          {revealed && (
            <div className="mt-2 text-sm">
              <span className="text-ink-mute">Correct answer: </span>
              <code className="text-good">{question.correct}</code>
            </div>
          )}
        </div>
      )}

      {question.type === 'match_pairs' && question.pairs && (
        <MatchPairs
          pairs={question.pairs}
          mode={mode}
          graded={revealed}
          answer={answer}
          onSelfMark={selfMark}
        />
      )}

      <footer className="mt-5 flex flex-wrap items-center gap-2">
        {/* Match pairs are graded by the self-mark itself, not by a separate check. */}
        {!revealed && mode === 'study' && question.type !== 'match_pairs' && (
          <button onClick={() => submit()} className="btn btn-primary" disabled={!answer}>
            Check answer
          </button>
        )}
        {mode === 'mock' && (
          <button onClick={() => submit()} className="btn" disabled={!answer}>
            Save and continue
          </button>
        )}
        {saved && <div className="chip chip-good">✓ Saved</div>}
        {revealed && mode === 'study' && (
          <div ref={verdictRef} tabIndex={-1} className={`chip ${correct ? 'chip-good' : 'chip-bad'}`}>
            {correct ? '✓ Correct' : '✕ Incorrect'}
          </div>
        )}
        {canPrev && onPrev && (
          <button onClick={() => navigate(onPrev)} className="btn btn-ghost">
            ◂ Previous
          </button>
        )}
        {onNext && (
          <button onClick={() => navigate(onNext)} className="btn btn-ghost" disabled={isLast}>
            Next ▸
          </button>
        )}
      </footer>

      {revealed && question.explanation && (
        <div className="mt-4 border-t border-line pt-4">
          <div className="text-xs uppercase tracking-wider text-ink-mute font-semibold mb-1">
            Explanation
          </div>
          <p className="text-sm text-ink-dim leading-relaxed whitespace-pre-line">
            {question.explanation}
          </p>
        </div>
      )}
    </article>
  )
}

function DragDropOrder({
  value,
  revealed,
  correct,
  onChange,
}: {
  value: string
  revealed: boolean
  correct?: string
  onChange: (v: string) => void
}) {
  const order = value.split(' -> ').map((s) => s.trim())

  const move = (idx: number, dir: -1 | 1) => {
    const newOrder = [...order]
    const j = idx + dir
    if (j < 0 || j >= newOrder.length) return
    ;[newOrder[idx], newOrder[j]] = [newOrder[j], newOrder[idx]]
    onChange(newOrder.join(' -> '))
  }

  const correctOrder = correct?.split(' -> ').map((s) => s.trim()) ?? []

  return (
    <ol className="space-y-2">
      {order.map((opt, i) => {
        const correctHere = revealed && correctOrder[i] === opt
        const wrongHere = revealed && !correctHere
        return (
          // Keyed by content, not position, so a moved step keeps its DOM node and keyboard focus.
          <li
            key={opt}
            className={`flex items-center gap-3 border rounded-lg p-3 ${
              revealed
                ? correctHere
                  ? 'border-good/60 bg-good/10'
                  : wrongHere
                  ? 'border-bad/60 bg-bad/10'
                  : 'border-line'
                : 'border-line'
            }`}
          >
            <div className="shrink-0 w-7 h-7 grid place-items-center rounded-md bg-bg-3 border border-line text-xs font-mono">
              {i + 1}
            </div>
            <div className="flex-1 text-sm text-ink-dim">{opt}</div>
            {!revealed && (
              <div className="flex gap-1">
                <button
                  onClick={() => move(i, -1)}
                  className="btn btn-ghost text-xs px-2"
                  aria-label={`Move "${opt}" up`}
                  aria-disabled={i === 0}
                >
                  ▴
                </button>
                <button
                  onClick={() => move(i, 1)}
                  className="btn btn-ghost text-xs px-2"
                  aria-label={`Move "${opt}" down`}
                  aria-disabled={i === order.length - 1}
                >
                  ▾
                </button>
              </div>
            )}
          </li>
        )
      })}
      {revealed && correct && (
        <li className="text-xs text-ink-mute pt-2">
          <span className="font-semibold">Correct order:</span>{' '}
          <span className="font-mono">{correct}</span>
        </li>
      )}
    </ol>
  )
}

// Self-graded: think of each match, reveal (study mode only), then say whether you had them all.
// A mock never reveals, so there the self-mark is a blind, changeable selection saved like any answer.
function MatchPairs({
  pairs,
  mode,
  graded,
  answer,
  onSelfMark,
}: {
  pairs: { left: string; right: string }[]
  mode: 'study' | 'mock'
  graded: boolean
  answer: string
  onSelfMark: (matched: boolean) => void
}) {
  const [shown, setShown] = useState(false)
  const answersVisible = mode === 'study' && (shown || graded)
  const canMark = mode === 'mock' || answersVisible
  const hint =
    mode === 'mock'
      ? 'Match each left-hand side in your head. Answers stay hidden during the mock.'
      : answersVisible
      ? 'Compare with what you had in mind, then grade yourself.'
      : 'Match each left-hand side in your head, then reveal the answers.'

  return (
    <div>
      <p className="text-xs text-ink-mute mb-3">{hint}</p>
      <div className="grid lg:grid-cols-2 gap-2">
        {pairs.map((p) => (
          <div key={p.left} className="border border-line rounded-lg p-3 text-sm">
            <div className="text-ink font-medium">{p.left}</div>
            <div
              aria-hidden={!answersVisible}
              className={`mt-1 text-ink-dim leading-snug ${
                answersVisible ? '' : 'blur-sm select-none'
              }`}
            >
              ➜ {p.right}
            </div>
          </div>
        ))}
      </div>
      {canMark ? (
        <div role="group" aria-label="Did you get every pair?" className="mt-3 flex flex-wrap gap-2">
          {/* After a click on "Reveal answers" (which unmounts), keep keyboard focus in the card. */}
          <SelfMarkButton
            pressed={answer === 'self-correct'}
            locked={graded}
            autoFocus={shown}
            onClick={() => onSelfMark(true)}
          >
            I got it
          </SelfMarkButton>
          <SelfMarkButton pressed={answer === 'self-wrong'} locked={graded} onClick={() => onSelfMark(false)}>
            I missed
          </SelfMarkButton>
        </div>
      ) : (
        <button onClick={() => setShown(true)} className="btn btn-primary mt-3">
          Reveal answers
        </button>
      )}
    </div>
  )
}

function SelfMarkButton({
  pressed,
  locked,
  autoFocus,
  onClick,
  children,
}: {
  pressed: boolean
  locked: boolean
  autoFocus?: boolean
  onClick: () => void
  children: string
}) {
  return (
    // aria-disabled, not disabled: grading locks the button while it has focus, and a disabled
    // button would drop that focus.
    <button onClick={onClick} className="btn" aria-pressed={pressed} aria-disabled={locked} autoFocus={autoFocus}>
      <span
        aria-hidden
        className={`grid place-items-center w-4 h-4 rounded-full border text-[10px] font-bold ${
          pressed ? 'bg-accent border-accent text-bg' : 'border-line-strong'
        }`}
      >
        {pressed && '✓'}
      </span>
      {children}
    </button>
  )
}
