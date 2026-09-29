import type { Question } from '../types'
import { joinPicks, PLACEHOLDER, slotChoices, slotKey, slotPicks } from '../lib/slots'
import { plainText } from '../lib/richText'
import RichText, { CodeBlock } from './RichText'
import { ChoiceText, SlotBadge } from './SlotReview'

// A code snippet (code_fill) or a statement (text_fill) with numbered placeholders, each answered from its
// own native dropdown, so keyboard, screen reader and touch need nothing custom. An empty placeholder is
// dashed until chosen. Once graded, each placeholder shows the choice made and is marked right or wrong
// with a glyph and in words, not by color alone; SlotReview then lists the correct values and why.
export default function SlotFill({
  question,
  value,
  graded,
  onChange,
}: {
  question: Question
  value: string
  graded: boolean
  onChange?: (value: string) => void
}) {
  const code = question.type === 'code_fill'
  const picks = slotPicks(question, value)
  const key = slotKey(question)

  const choose = (slot: number, pick: number | undefined) => {
    const next = [...picks]
    next[slot] = pick
    onChange?.(joinPicks(next))
  }

  // Splitting on the capture group puts each placeholder's number at the odd indexes.
  const content = (question.template ?? '').split(PLACEHOLDER).map((part, i) => {
    if (i % 2 === 0) return code ? part : <RichText key={i} text={part} />
    const slot = Number(part) - 1
    const choices = slotChoices(question, slot)
    const pick = picks[slot]

    if (graded) {
      const hit = pick === key[slot]
      return (
        <span
          key={i}
          className={`relative inline rounded-md border px-1 py-px ${
            pick === undefined ? 'border-dashed border-line-strong' : hit ? 'border-good/60 bg-good/10' : 'border-bad/60 bg-bad/10'
          }`}
        >
          <SlotBadge n={slot + 1} /> {pick === undefined ? <span className="text-ink-mute italic">not answered</span> : code ? choices[pick] : <ChoiceText question={question} text={choices[pick]} />}
          <span aria-hidden className={hit ? 'text-good' : 'text-bad'}>
            {hit ? ' ✓' : ' ✕'}
          </span>
          <span className="sr-only">{hit ? ' (correct)' : ' (incorrect)'}</span>
        </span>
      )
    }

    return (
      <span key={i} className="whitespace-nowrap">
        <SlotBadge n={slot + 1} filled={pick !== undefined} />{' '}
        <select
          aria-label={`Placeholder ${slot + 1}`}
          value={pick ?? ''}
          onChange={(e) => choose(slot, e.target.value === '' ? undefined : Number(e.target.value))}
          className={`rounded-md px-1.5 py-0.5 align-baseline cursor-pointer ${code ? 'font-mono text-[13px]' : 'text-sm max-w-full'} ${
            pick === undefined ? 'border-dashed border-accent/70 text-ink-mute' : 'border-accent text-ink'
          }`}
        >
          <option value="" disabled>
            Choose…
          </option>
          {choices.map((choice, k) => (
            <option key={k} value={k}>
              {plainText(choice)}
            </option>
          ))}
        </select>
      </span>
    )
  })

  return code ? <CodeBlock>{content}</CodeBlock> : <p className="text-[15px] text-ink leading-9">{content}</p>
}
