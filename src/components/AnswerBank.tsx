import { useId, useState } from 'react'
import type { DragEvent } from 'react'
import type { FlatQuestion } from '../types'
import { answerOrder } from '../lib/exam'
import { joinPicks, slotPicks } from '../lib/slots'
import { plainText } from '../lib/richText'
import RichText from './RichText'
import { SlotBadge } from './SlotReview'

const LABEL = 'text-xs uppercase tracking-wider text-ink-mute font-semibold mb-2'

// Requirements filled from one shared bank of answers, each answer used at most once. Drag an answer onto
// a requirement with a mouse, or, where dragging is awkward (touch, keyboard, screen reader), tap an answer
// and then its requirement: every control is a native button, so both paths need nothing custom. Placing
// an answer that is already used moves it; the answer it displaces goes back to the bank. Once graded,
// SlotReview replaces the bank.
export default function AnswerBank({
  question,
  value,
  onChange,
}: {
  question: FlatQuestion
  value: string
  onChange: (value: string) => void
}) {
  const bank = question.bank ?? []
  const slots = question.slots ?? []
  const ids = useId()
  // Shuffled once per page session, so the bank's order gives nothing away and stays put on a revisit.
  const [order] = useState(() => answerOrder(question.id, bank.length))
  const picks = slotPicks(question, value)
  const [selected, setSelected] = useState<number | null>(null)
  const [over, setOver] = useState<number | 'bank' | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const [dragged, setDragged] = useState<number | null>(null)
  const answerName = (answer: number) => plainText(bank[answer])

  const commit = (next: (number | undefined)[], message: string) => {
    onChange(joinPicks(next))
    setSelected(null)
    setAnnouncement(message)
  }

  const place = (slot: number, answer: number) => {
    const from = picks.indexOf(answer)
    if (from === slot) {
      setSelected(null)
      setAnnouncement(`${answerName(answer)} stays in requirement ${slot + 1}.`)
      return
    }
    const next = [...picks]
    const displaced = next[slot]
    if (from !== -1) next[from] = undefined
    next[slot] = answer
    let message = `Placed ${answerName(answer)} in requirement ${slot + 1}.`
    if (from !== -1) message += ` Requirement ${from + 1} is empty again.`
    if (displaced !== undefined) message += ` ${answerName(displaced)} is back in the answer bank.`
    commit(next, message)
  }

  const remove = (slot: number) => {
    const answer = picks[slot]
    if (answer === undefined) return
    const next = [...picks]
    next[slot] = undefined
    commit(next, `${answerName(answer)} is back in the answer bank. Requirement ${slot + 1} is empty.`)
  }

  const pickUp = (answer: number) => {
    if (selected === answer) {
      setSelected(null)
      setAnnouncement(`${answerName(answer)} is no longer selected.`)
    } else {
      setSelected(answer)
      setAnnouncement(`Selected ${answerName(answer)}. Now choose the requirement to place it in.`)
    }
  }

  // A tap on a requirement places the selected answer there; with nothing selected, a filled requirement
  // hands its answer over to be moved.
  const tapRequirement = (slot: number) => {
    if (selected !== null) return place(slot, selected)
    const held = picks[slot]
    if (held === undefined) setAnnouncement('Choose an answer from the answer bank first.')
    else {
      setSelected(held)
      setAnnouncement(`Picked up ${answerName(held)} from requirement ${slot + 1}. Choose where to place it.`)
    }
  }

  const startDrag = (e: DragEvent, answer: number) => {
    setDragged(answer)
    // Some browsers only start a drag that carries data; absent in test environments.
    e.dataTransfer?.setData('text/plain', answerName(answer))
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
  }
  const endDrag = () => {
    setDragged(null)
    setOver(null)
  }
  const dropZone = (target: number | 'bank') => ({
    onDragOver: (e: DragEvent) => {
      if (dragged === null) return
      e.preventDefault() // accept the drop
      setOver(target)
    },
    onDragLeave: (e: DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver((o) => (o === target ? null : o))
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault()
      endDrag()
      if (dragged === null) return
      if (target !== 'bank') place(target, dragged)
      else if (picks.includes(dragged)) remove(picks.indexOf(dragged))
    },
  })

  return (
    <div className="@container">
      <p className="text-xs text-ink-mute mb-3">
        Drag an answer onto a requirement, or tap an answer and then a requirement. Each answer is used once.
      </p>
      <div className="grid gap-5 @xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] @xl:gap-6">
        <div
          role="group"
          aria-labelledby={`${ids}-bank`}
          {...dropZone('bank')}
          className={`rounded-lg transition ${over === 'bank' ? 'ring-1 ring-accent' : ''}`}
        >
          <div id={`${ids}-bank`} className={LABEL}>
            Answer bank
          </div>
          <ul className="flex flex-wrap gap-2 @xl:flex-col">
            {order.map((answer) => {
              const owner = picks.indexOf(answer)
              const isSelected = selected === answer
              return (
                <li key={answer} className="max-w-full @xl:w-full">
                  <button
                    type="button"
                    draggable
                    onDragStart={(e) => startDrag(e, answer)}
                    onDragEnd={endDrag}
                    onClick={() => pickUp(answer)}
                    aria-pressed={isSelected}
                    aria-label={owner === -1 ? answerName(answer) : `${answerName(answer)}, placed in requirement ${owner + 1}`}
                    className={`w-full text-left flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition cursor-grab active:cursor-grabbing max-sm:min-h-11 ${
                      isSelected
                        ? 'border-accent bg-accent/10 ring-1 ring-accent text-ink'
                        : owner === -1
                        ? 'border-line-strong bg-bg-2 text-ink hover:border-accent/60'
                        : 'border-line bg-bg-1 text-ink-mute hover:border-line-strong'
                    }`}
                  >
                    <span className="min-w-0 flex-1 leading-snug wrap-break-word">
                      <RichText text={bank[answer]} />
                    </span>
                    {owner !== -1 && <SlotBadge n={owner + 1} />}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>

        <div>
          <div className={LABEL}>Requirements</div>
          {selected !== null && (
            <p aria-hidden className="-mt-1 mb-2 text-xs text-accent leading-snug">
              Selected: {answerName(selected)}. Tap a requirement to place it.
            </p>
          )}
          <ol className="space-y-2">
            {slots.map((slot, i) => {
              const pick = picks[i]
              const promptId = `${ids}-requirement-${i}`
              return (
                <li
                  key={i}
                  {...dropZone(i)}
                  className={`rounded-lg border p-3 transition ${
                    over === i ? 'border-accent bg-accent/10' : pick === undefined ? 'border-dashed border-line-strong' : 'border-line'
                  }`}
                >
                  <p id={promptId} className="flex gap-2 text-sm text-ink leading-snug">
                    <SlotBadge n={i + 1} filled={pick !== undefined} />
                    <span className="min-w-0 wrap-break-word">
                      <RichText text={slot.prompt ?? ''} />
                    </span>
                  </p>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      draggable={pick !== undefined}
                      onDragStart={(e) => pick !== undefined && startDrag(e, pick)}
                      onDragEnd={endDrag}
                      onClick={() => tapRequirement(i)}
                      aria-label={`Requirement ${i + 1}, ${pick === undefined ? 'empty' : `holds ${answerName(pick)}`}`}
                      aria-describedby={promptId}
                      className={`flex-1 min-w-0 min-h-10 text-left rounded-md border px-3 py-2 text-sm transition cursor-pointer max-sm:min-h-11 ${
                        pick === undefined
                          ? `border-dashed ${selected !== null ? 'border-accent text-accent' : 'border-line-strong text-ink-mute'}`
                          : 'border-accent/60 bg-accent/5 text-ink'
                      }`}
                    >
                      {pick === undefined ? (selected !== null ? '▸ Place here' : 'Empty') : <RichText text={bank[pick]} />}
                    </button>
                    {pick !== undefined && (
                      <button
                        type="button"
                        onClick={() => remove(i)}
                        aria-label={`Remove ${answerName(pick)} from requirement ${i + 1}`}
                        className="btn btn-ghost px-2.5 max-sm:min-h-11"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </li>
              )
            })}
          </ol>
        </div>
      </div>
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  )
}
