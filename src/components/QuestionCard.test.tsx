import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { FlatQuestion } from '../types'
import QuestionCard from './QuestionCard'

afterEach(cleanup)

const base = {
  id: 'q1',
  domain: '1.1',
  domainId: 1,
  domainTitle: 'Domain',
  objectiveId: '1.1',
  objectiveTitle: 'Objective',
  explanation: 'Because reasons.',
}

const choice: FlatQuestion = {
  ...base,
  type: 'multiple_choice',
  stem: 'Pick one',
  options: ['A. alpha', 'B. beta'],
  correct: 'B',
}

const pairs: FlatQuestion = {
  ...base,
  type: 'match_pairs',
  stem: 'Match the CLI control to its purpose.',
  pairs: [
    { left: 'Shift+Tab', right: 'Toggle autopilot' },
    { left: '/yolo', right: 'Permit everything' },
    { left: 'Cancel', right: 'Reject the operation' },
  ],
  correct: 'see pairs',
}
const RIGHT_MATCH = { 'Shift+Tab': 'Toggle autopilot', '/yolo': 'Permit everything', Cancel: 'Reject the operation' }

const blank: FlatQuestion = { ...base, type: 'fill_blank', stem: 'Fill it', correct: 'answer' }

const order: FlatQuestion = {
  ...base,
  type: 'drag_drop_order',
  stem: 'Order it',
  options: ['one', 'two', 'three'],
  correct: 'one -> two -> three',
}

const btn = (name: string | RegExp) => screen.getByRole('button', { name })
const pressed = (name: string | RegExp) => btn(name).getAttribute('aria-pressed')

// Match pairs: items are radios (which item the next answer goes to), answers are buttons.
const item = (left: string) => screen.getByRole('radio', { name: (name) => name.includes(`. ${left}, `) }) as HTMLInputElement
const itemName = (left: string) => item(left).getAttribute('aria-label')
const itemCard = (left: string) => within(item(left).closest('label')!)
const answer = (right: string) =>
  screen.getByRole('button', { name: (name) => name === right || name.startsWith(`${right}, matched with`) })
const answerOrder = () =>
  within(screen.getByRole('group', { name: /^Answers/ }))
    .getAllByRole('button')
    .map((b) => b.getAttribute('aria-label')!.split(', matched with')[0])
const announced = () => screen.getByRole('status').textContent

async function match(user: ReturnType<typeof userEvent.setup>, mapping: Record<string, string>) {
  for (const [left, right] of Object.entries(mapping)) {
    await user.click(item(left))
    await user.click(answer(right))
  }
}

function study(question: FlatQuestion, props: Partial<Parameters<typeof QuestionCard>[0]> = {}) {
  const onAnswer = vi.fn()
  const onNext = vi.fn()
  render(
    <QuestionCard question={question} index={0} total={3} mode="study" onAnswer={onAnswer} onNext={onNext} {...props} />,
  )
  return { onAnswer, onNext }
}

// Mirrors MockExamPage: the saved answer is fed back in as initialAnswer.
function MockHarness({ question, onAnswer, onNext }: { question: FlatQuestion; onAnswer: () => void; onNext: () => void }) {
  const [saved, setSaved] = useState<string>()
  return (
    <QuestionCard
      question={question}
      index={0}
      total={3}
      mode="mock"
      initialAnswer={saved}
      onAnswer={(_qid, given) => {
        setSaved(given)
        onAnswer()
      }}
      onNext={onNext}
    />
  )
}

describe('match pairs in practice', () => {
  it('shows every item and every answer at once, with nothing matched yet', () => {
    study(pairs)
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.getAllByRole('radio').map((r) => r.getAttribute('aria-label'))).toEqual([
      '1. Shift+Tab, not matched yet',
      '2. /yolo, not matched yet',
      '3. Cancel, not matched yet',
    ])
    expect(item('Shift+Tab').checked).toBe(true)
    expect(itemCard('Shift+Tab').getByText('▸ Choosing')).toBeTruthy()
    expect(answerOrder().sort()).toEqual(Object.values(RIGHT_MATCH).sort())
    for (const right of Object.values(RIGHT_MATCH)) expect(answer(right).getAttribute('aria-pressed')).toBe('false')
    expect(screen.queryByRole('button', { name: 'Reveal answers' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'I got it' })).toBeNull()
    expect((btn('Check answer') as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('0 of 3 matched')).toBeTruthy()
  })

  it('pairs an answer with the chosen item, shows the pair on both sides, and moves on', async () => {
    const user = userEvent.setup()
    study(pairs)
    await user.click(answer('Toggle autopilot'))

    expect(itemName('Shift+Tab')).toBe('1. Shift+Tab, matched with Toggle autopilot')
    expect(itemCard('Shift+Tab').getByText('→ Toggle autopilot')).toBeTruthy()
    expect(answer('Toggle autopilot').getAttribute('aria-label')).toBe('Toggle autopilot, matched with item 1')
    expect(within(answer('Toggle autopilot')).getByText('1')).toBeTruthy()
    expect(item('/yolo').checked).toBe(true)
    expect(announced()).toBe('Matched 1. Shift+Tab with Toggle autopilot. Now choosing for 2. /yolo.')
    expect(screen.getByText('1 of 3 matched')).toBeTruthy()
  })

  it('choosing another item makes it the target and shows its answer as selected', async () => {
    const user = userEvent.setup()
    study(pairs)
    await match(user, { 'Shift+Tab': 'Toggle autopilot' })
    expect(answer('Toggle autopilot').getAttribute('aria-pressed')).toBe('false')

    await user.click(item('Shift+Tab'))

    expect(answer('Toggle autopilot').getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('group', { name: 'Answers, choosing for 1. Shift+Tab' })).toBeTruthy()
    // The radio announces the new target itself; an old pairing message must not linger.
    expect(announced()).toBe('')
  })

  it('changes an item to an unused answer and frees its old one', async () => {
    const user = userEvent.setup()
    study(pairs)
    await match(user, { 'Shift+Tab': 'Toggle autopilot' })
    await user.click(item('Shift+Tab'))
    await user.click(answer('Reject the operation'))

    expect(itemName('Shift+Tab')).toBe('1. Shift+Tab, matched with Reject the operation')
    expect(answer('Toggle autopilot').getAttribute('aria-label')).toBe('Toggle autopilot')
    expect(announced()).toBe(
      'Matched 1. Shift+Tab with Reject the operation. Toggle autopilot is free again. Now choosing for 2. /yolo.',
    )
  })

  it('moves on to the next unmatched item, wrapping round to the top', async () => {
    const user = userEvent.setup()
    study(pairs)
    await user.click(item('/yolo'))
    await user.click(answer('Permit everything'))
    expect(item('Cancel').checked).toBe(true)
    await user.click(answer('Reject the operation'))
    expect(item('Shift+Tab').checked).toBe(true)
    expect(announced()).toMatch(/ Now choosing for 1\. Shift\+Tab\.$/)
  })

  it('pairs once on a double-click or a held Enter, instead of moving the answer on', async () => {
    const user = userEvent.setup()
    study(pairs)
    await user.dblClick(answer('Toggle autopilot'))
    expect(itemName('Shift+Tab')).toBe('1. Shift+Tab, matched with Toggle autopilot')
    expect(itemName('/yolo')).toBe('2. /yolo, not matched yet')

    answer('Permit everything').focus()
    await user.keyboard('{Enter>3/}')
    expect(itemName('/yolo')).toBe('2. /yolo, matched with Permit everything')
    expect(itemName('Cancel')).toBe('3. Cancel, not matched yet')
  })

  it('moves an answer used by another item, which becomes unmatched and the next target', async () => {
    const user = userEvent.setup()
    study(pairs)
    await match(user, RIGHT_MATCH)
    expect((btn('Check answer') as HTMLButtonElement).disabled).toBe(false)

    await user.click(item('Shift+Tab'))
    await user.click(answer('Permit everything'))

    expect(itemName('Shift+Tab')).toBe('1. Shift+Tab, matched with Permit everything')
    expect(itemName('/yolo')).toBe('2. /yolo, not matched yet')
    expect(item('/yolo').checked).toBe(true)
    expect(answer('Toggle autopilot').getAttribute('aria-label')).toBe('Toggle autopilot')
    expect(announced()).toBe(
      'Moved Permit everything from item 2 to 1. Shift+Tab. Item 2 is now unmatched. Toggle autopilot is free again. Now choosing for 2. /yolo.',
    )
    expect((btn('Check answer') as HTMLButtonElement).disabled).toBe(true)
  })

  it("removes a pair when the item's own answer is chosen again", async () => {
    const user = userEvent.setup()
    study(pairs)
    await match(user, { 'Shift+Tab': 'Toggle autopilot' })
    await user.click(item('Shift+Tab'))
    await user.click(answer('Toggle autopilot'))

    expect(itemName('Shift+Tab')).toBe('1. Shift+Tab, not matched yet')
    expect(answer('Toggle autopilot').getAttribute('aria-pressed')).toBe('false')
    expect(item('Shift+Tab').checked).toBe(true)
    expect(announced()).toBe('Removed the match for 1. Shift+Tab.')
    expect(screen.getByText('0 of 3 matched')).toBeTruthy()
  })

  it('records a correct mapping once as correct and locks it', async () => {
    const user = userEvent.setup()
    const { onAnswer } = study(pairs)
    await match(user, RIGHT_MATCH)
    await user.click(btn('Check answer'))

    expect(onAnswer).toHaveBeenCalledExactlyOnceWith('q1', '0,1,2', true)
    expect(screen.getByText('✓ Correct · 3 of 3 pairs')).toBeTruthy()
    expect(screen.getByText('Because reasons.')).toBeTruthy()
    for (const left of Object.keys(RIGHT_MATCH)) {
      expect(item(left).disabled).toBe(true)
      expect(itemCard(left).getByText('✓ Matched correctly')).toBeTruthy()
    }
    // Each item now shows its match and the result, so the answer list has nothing left to add.
    expect(screen.queryByRole('group', { name: /^Answers/ })).toBeNull()
    expect(screen.queryByText('▸ Choosing')).toBeNull()
    // Checking is the only way to see the answers, and it cannot record a second attempt.
    expect(screen.queryByRole('button', { name: 'Check answer' })).toBeNull()
  })

  it('records a wrong mapping as incorrect and shows the right match for each miss', async () => {
    const user = userEvent.setup()
    const { onAnswer } = study(pairs)
    await match(user, { 'Shift+Tab': 'Permit everything', '/yolo': 'Toggle autopilot', Cancel: 'Reject the operation' })
    await user.click(btn('Check answer'))

    expect(onAnswer).toHaveBeenCalledExactlyOnceWith('q1', '1,0,2', false)
    expect(screen.getByText('✕ Incorrect · 1 of 3 pairs')).toBeTruthy()
    expect(itemCard('Shift+Tab').getByText(/Should be:/).textContent).toBe('✕ Should be: Toggle autopilot')
    expect(itemName('Shift+Tab')).toBe('1. Shift+Tab, matched with Permit everything, incorrect, should be Toggle autopilot')
    expect(itemCard('Cancel').getByText('✓ Matched correctly')).toBeTruthy()
    expect(itemName('Cancel')).toBe('3. Cancel, matched with Reject the operation, correct')
    expect(itemCard('Cancel').queryByText(/Should be:/)).toBeNull()
  })

  it('is operable from the keyboard', async () => {
    const user = userEvent.setup()
    const { onAnswer } = study(pairs)
    await user.tab()
    expect(document.activeElement).toBe(item('Shift+Tab'))
    await user.keyboard('{ArrowDown}')
    expect(document.activeElement).toBe(item('/yolo'))
    expect(item('/yolo').checked).toBe(true)
    await user.keyboard('{ArrowUp}')
    expect(item('Shift+Tab').checked).toBe(true)

    // Each press pairs with the current item and keeps focus on the pressed answer.
    const answers = within(screen.getByRole('group', { name: /^Answers/ })).getAllByRole('button')
    for (const a of answers) {
      await user.tab()
      expect(document.activeElement).toBe(a)
      await user.keyboard(' ')
      expect(document.activeElement).toBe(a)
    }
    expect(screen.getByText('3 of 3 matched')).toBeTruthy()

    await user.tab()
    expect(document.activeElement).toBe(btn('Check answer'))
    await user.keyboard('{Enter}')
    expect(onAnswer).toHaveBeenCalledOnce()
    expect(document.activeElement).toBe(screen.getByText(/^(✓ Correct|✕ Incorrect)/))
  })

  it('keeps each question’s answer order across updates and visits, never in key order', async () => {
    const user = userEvent.setup()
    const fresh = { ...pairs, id: 'q-order' }
    // With random() pinned high the shuffle is the identity, which would put item n's match at position n.
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.99)
    let first: string[]
    try {
      study(fresh)
      first = answerOrder()
      expect(first).not.toEqual(Object.values(RIGHT_MATCH))
    } finally {
      random.mockRestore()
    }
    await match(user, { 'Shift+Tab': 'Reject the operation', '/yolo': 'Toggle autopilot' })
    expect(answerOrder()).toEqual(first)

    cleanup()
    study(fresh)
    expect(answerOrder()).toEqual(first)
  })
})

describe('match pairs in mock mode', () => {
  it('saves the mapping without revealing anything, and advances', async () => {
    const user = userEvent.setup()
    const onAnswer = vi.fn()
    const onNext = vi.fn()
    render(<MockHarness question={pairs} onAnswer={onAnswer} onNext={onNext} />)

    await match(user, { 'Shift+Tab': 'Permit everything', '/yolo': 'Toggle autopilot' })
    expect((btn('Save and continue') as HTMLButtonElement).disabled).toBe(true)
    await match(user, { Cancel: 'Reject the operation' })
    await user.click(btn('Save and continue'))

    expect(onAnswer).toHaveBeenCalledOnce()
    expect(onNext).toHaveBeenCalledOnce()
    expect(screen.getByText('✓ Saved')).toBeTruthy()
    expect((answer('Permit everything') as HTMLButtonElement).disabled).toBe(false)
    expect(screen.queryByText(/Should be:|Matched correctly|Because reasons/)).toBeNull()
  })

  it('restores a saved mapping when revisited, stays editable, and drops the saved mark once changed', async () => {
    const user = userEvent.setup()
    render(<QuestionCard question={pairs} index={0} total={3} mode="mock" initialAnswer="1,0,2" />)
    expect(itemName('Shift+Tab')).toBe('1. Shift+Tab, matched with Permit everything')
    expect(itemName('/yolo')).toBe('2. /yolo, matched with Toggle autopilot')
    expect(itemName('Cancel')).toBe('3. Cancel, matched with Reject the operation')
    expect(screen.getByText('✓ Saved')).toBeTruthy()

    await user.click(item('Cancel'))
    await user.click(answer('Reject the operation'))
    expect(screen.queryByText('✓ Saved')).toBeNull()
    expect((btn('Save and continue') as HTMLButtonElement).disabled).toBe(true)

    await user.click(answer('Reject the operation'))
    expect(itemName('Cancel')).toBe('3. Cancel, matched with Reject the operation')
    expect(screen.getByText('✓ Saved')).toBeTruthy()
  })

  it.each([
    ['a self-grade saved by the old version', 'self-correct'],
    ['a mapping saved when the question had more pairs', '0,1,2,3'],
  ])('treats %s as unanswered', (_label, initialAnswer) => {
    render(<QuestionCard question={pairs} index={0} total={3} mode="mock" initialAnswer={initialAnswer} />)
    for (const left of Object.keys(RIGHT_MATCH)) expect(itemName(left)).toMatch(/, not matched yet$/)
    expect(screen.queryByText('✓ Saved')).toBeNull()
    expect((btn('Save and continue') as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('mock mode', () => {
  it('saving keeps the choice selected, never shows the solution, and advances', async () => {
    const user = userEvent.setup()
    const onAnswer = vi.fn()
    const onNext = vi.fn()
    render(<MockHarness question={choice} onAnswer={onAnswer} onNext={onNext} />)

    await user.click(btn(/beta/))
    await user.click(btn('Save and continue'))

    expect(onAnswer).toHaveBeenCalledOnce()
    expect(onNext).toHaveBeenCalledOnce()
    expect(pressed(/beta/)).toBe('true')
    expect(screen.getByText('✓ Saved')).toBeTruthy()
    expect(screen.queryByText('Because reasons.')).toBeNull()
    expect(screen.queryByText(/Correct/)).toBeNull()
  })

  it('drops the saved mark once the answer is changed', async () => {
    const user = userEvent.setup()
    render(<QuestionCard question={choice} index={0} total={3} mode="mock" initialAnswer="A" />)
    expect(screen.getByText('✓ Saved')).toBeTruthy()
    await user.click(btn(/beta/))
    expect(screen.queryByText('✓ Saved')).toBeNull()
  })

  it('shows a previously saved answer as selected when revisiting', () => {
    render(<QuestionCard question={choice} index={0} total={3} mode="mock" initialAnswer="A" />)
    expect(pressed(/alpha/)).toBe('true')
    expect(pressed(/beta/)).toBe('false')
  })
})

describe('choice questions', () => {
  it('reflects the selection and locks the options after checking', async () => {
    const user = userEvent.setup()
    study(choice)
    await user.click(btn(/alpha/))
    expect(pressed(/alpha/)).toBe('true')
    await user.click(btn(/beta/))
    expect(pressed(/beta/)).toBe('true')
    expect(pressed(/alpha/)).toBe('false')

    await user.click(btn('Check answer'))
    expect((btn(/alpha/) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('✓ Correct')).toBeTruthy()
  })

  it('moves keyboard focus to the verdict when Check answer goes away', async () => {
    const user = userEvent.setup()
    study(choice)
    await user.click(btn(/beta/))
    btn('Check answer').focus()
    await user.keyboard('{Enter}')
    expect(document.activeElement).toBe(screen.getByText('✓ Correct'))
  })
})

describe('multi-select questions', () => {
  it('toggles each option independently and grades the whole set', async () => {
    const user = userEvent.setup()
    const multi: FlatQuestion = { ...choice, type: 'multi_select', options: ['A. alpha', 'B. beta', 'C. gamma'], correct: 'A,C' }
    const { onAnswer } = study(multi)
    await user.click(btn(/alpha/))
    await user.click(btn(/beta/))
    await user.click(btn(/gamma/))
    await user.click(btn(/beta/))
    expect([pressed(/alpha/), pressed(/beta/), pressed(/gamma/)]).toEqual(['true', 'false', 'true'])
    await user.click(btn('Check answer'))
    expect(onAnswer).toHaveBeenCalledExactlyOnceWith('q1', 'A,C', true)
  })
})

describe('fill in the blank', () => {
  it('cannot be edited after checking, so the verdict matches what was recorded', async () => {
    const user = userEvent.setup()
    const { onAnswer } = study(blank)
    await user.type(screen.getByRole('textbox'), 'wrong')
    await user.click(btn('Check answer'))
    expect(onAnswer).toHaveBeenCalledExactlyOnceWith('q1', 'wrong', false)
    expect((screen.getByRole('textbox') as HTMLInputElement).disabled).toBe(true)
    expect(screen.getByText('✕ Incorrect')).toBeTruthy()
  })
})

describe('order the steps', () => {
  const rows = () => within(screen.getByRole('list')).getAllByRole('listitem').map((li) => li.textContent)

  it('can be checked as displayed: the shown order is the answer', () => {
    study(order)
    expect((btn('Check answer') as HTMLButtonElement).disabled).toBe(false)
  })

  it('never starts in the solved order', () => {
    for (let i = 0; i < 10; i++) {
      study(order)
      const shown = rows().map((t) => ['one', 'two', 'three'].find((o) => t?.includes(o)))
      expect(shown).not.toEqual(['one', 'two', 'three'])
      cleanup()
    }
  })

  it('keeps keyboard focus on the moved step', async () => {
    const user = userEvent.setup()
    study(order)
    const first = rows()[0]!.match(/one|two|three/)![0]
    btn(`Move "${first}" down`).focus()
    await user.keyboard('{Enter}')
    expect(document.activeElement).toBe(btn(`Move "${first}" down`))
    expect(rows()[1]).toContain(first)
  })

  it('marks moves past either end unavailable, and they do nothing', async () => {
    const user = userEvent.setup()
    study(order)
    const before = rows()
    const [top, , bottom] = before.map((t) => t!.match(/one|two|three/)![0])
    expect(btn(`Move "${top}" up`).getAttribute('aria-disabled')).toBe('true')
    expect(btn(`Move "${bottom}" down`).getAttribute('aria-disabled')).toBe('true')
    await user.click(btn(`Move "${top}" up`))
    expect(rows()).toEqual(before)
  })

  it('keeps keyboard focus on a step moved to the top', async () => {
    const user = userEvent.setup()
    study(order)
    const second = rows()[1]!.match(/one|two|three/)![0]
    btn(`Move "${second}" up`).focus()
    await user.keyboard('{Enter}')
    expect(rows()[0]).toContain(second)
    expect(document.activeElement).toBe(btn(`Move "${second}" up`))
  })
})

describe('navigation', () => {
  it('does not offer Next on the last question', () => {
    render(<QuestionCard question={choice} index={2} total={3} mode="study" onNext={() => {}} />)
    expect((btn('Next ▸') as HTMLButtonElement).disabled).toBe(true)
  })
})
