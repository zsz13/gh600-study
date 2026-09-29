import type { Question } from '../types'
import { slotChoices, slotKey, slotPicks } from '../lib/slots'
import RichText from './RichText'

// A multi-part answer once graded, slot by slot: what was chosen, the correct choice where they differ,
// and why. Shown after "Check answer" in practice and in a submitted mock's review, never before. Its
// title is a heading in the review, where every answer comparison has one, and a label on a question
// card, whose only heading is the question.
export default function SlotReview({ question, given, titleAs: Title = 'div' }: { question: Question; given?: string; titleAs?: 'div' | 'h3' }) {
  const picks = slotPicks(question, given ?? '')
  const key = slotKey(question)
  const hits = picks.filter((pick, i) => pick === key[i]).length
  return (
    <div className="@container">
      <Title className="text-xs uppercase tracking-wider text-ink-mute font-semibold mb-1.5">
        Your answers · {hits} of {key.length} correct
      </Title>
      <ol className="space-y-2">
        {(question.slots ?? []).map((slot, i) => {
          const choices = slotChoices(question, i)
          const pick = picks[i]
          const hit = pick === key[i]
          return (
            <li key={i} className={`rounded-lg border p-3 text-sm ${hit ? 'border-good/50 bg-good/10' : 'border-bad/50 bg-bad/10'}`}>
              <div className="flex gap-2 text-ink font-medium leading-snug">
                <SlotBadge n={i + 1} />
                <span className="min-w-0 wrap-break-word">
                  {/* Bank requirements and grid statements have a prompt; fill placeholders are numbered. */}
                  {slot.prompt ? <RichText text={slot.prompt} /> : `Placeholder ${i + 1}`}
                </span>
              </div>
              <div className="grid gap-x-4 gap-y-1 mt-1.5 @xl:grid-cols-2">
                <div className="min-w-0 leading-snug wrap-break-word">
                  <span className="text-xs text-ink-mute">Your answer: </span>
                  {pick === undefined ? (
                    <span className="text-ink-mute italic">Not answered</span>
                  ) : (
                    <ChoiceText question={question} text={choices[pick]} />
                  )}{' '}
                  <Mark ok={hit} />
                </div>
                {!hit && (
                  <div className="min-w-0 leading-snug wrap-break-word">
                    <span className="text-xs text-ink-mute">Correct answer: </span>
                    <span className="text-good">
                      <ChoiceText question={question} text={choices[key[i]]} />
                    </span>
                  </div>
                )}
              </div>
              <p className="mt-1.5 text-xs text-ink-dim leading-relaxed">
                <RichText text={slot.explanation} />
              </p>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

// A choice as the question writes it: code_fill choices are raw code, the other types' use bank markup.
export function ChoiceText({ question, text }: { question: Question; text: string }) {
  if (question.type !== 'code_fill') return <RichText text={text} />
  return <code className="font-mono text-[0.875em] px-1 py-px rounded bg-bg-3 border border-line wrap-break-word">{text}</code>
}

// The number a slot is known by, the same in the question and in its review; dashed while empty.
export function SlotBadge({ n, filled = true }: { n: number; filled?: boolean }) {
  return (
    <span
      aria-hidden
      className={`inline-grid place-items-center shrink-0 w-5 h-5 rounded-full text-[11px] leading-none font-mono font-semibold align-middle ${
        filled ? 'bg-accent text-bg' : 'border border-dashed border-line-strong text-ink-mute'
      }`}
    >
      {n}
    </span>
  )
}

function Mark({ ok }: { ok: boolean }) {
  return (
    <span className={ok ? 'text-good' : 'text-bad'}>
      <span aria-hidden>{ok ? '✓' : '✕'}</span>
      <span className="sr-only">{ok ? 'correct' : 'incorrect'}</span>
    </span>
  )
}
