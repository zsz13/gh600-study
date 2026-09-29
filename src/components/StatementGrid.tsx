import { useId } from 'react'
import type { Question } from '../types'
import { DEFAULT_LABELS, joinPicks, slotPicks } from '../lib/slots'
import RichText from './RichText'
import { SlotBadge } from './SlotReview'

// A Yes/No (or True/False) grid: each statement is its own native radio group, named by the statement,
// so it is answered independently and works the same with a mouse, a keyboard or a finger. Unanswered
// statements stay dashed. Once graded, SlotReview replaces the grid.
export default function StatementGrid({
  question,
  value,
  onChange,
}: {
  question: Question
  value: string
  onChange: (value: string) => void
}) {
  const group = useId()
  const labels = question.labels ?? DEFAULT_LABELS
  const picks = slotPicks(question, value)

  const choose = (slot: number, pick: number) => {
    const next = [...picks]
    next[slot] = pick
    onChange(joinPicks(next))
  }

  return (
    <ol className="space-y-2">
      {(question.slots ?? []).map((slot, i) => {
        const id = `${group}-${i}`
        const pick = picks[i]
        return (
          <li
            key={i}
            className={`rounded-lg border p-3 flex flex-wrap items-center gap-x-4 gap-y-2 ${
              pick === undefined ? 'border-dashed border-line-strong' : 'border-line'
            }`}
          >
            <p id={id} className="flex flex-1 basis-60 gap-2 text-sm text-ink leading-snug">
              <SlotBadge n={i + 1} filled={pick !== undefined} />
              <span className="min-w-0 wrap-break-word">
                <RichText text={slot.prompt ?? ''} />
              </span>
            </p>
            <div role="radiogroup" aria-labelledby={id} className="flex gap-2 ml-auto">
              {labels.map((label, k) => (
                <label
                  key={label}
                  className="flex items-center gap-2 rounded-lg border border-line-strong px-3 py-1.5 text-sm text-ink-dim cursor-pointer transition hover:border-accent/60 has-[:checked]:border-accent has-[:checked]:bg-accent/10 has-[:checked]:text-ink max-sm:min-h-11"
                >
                  <input type="radio" name={id} checked={pick === k} onChange={() => choose(i, k)} className="accent-accent" />
                  {label}
                </label>
              ))}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
