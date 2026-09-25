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
  ],
  correct: 'see pairs',
}

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

describe('match pairs in study mode', () => {
  it('hides the answers and offers no self-grade until they are revealed', () => {
    study(pairs)
    expect(screen.queryByRole('button', { name: 'I got it' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Check answer' })).toBeNull()
    expect(screen.getByText(/Toggle autopilot/).getAttribute('aria-hidden')).toBe('true')
    expect(btn('Reveal answers')).toBeTruthy()
  })

  it('self-grading after the reveal records the attempt and shows which choice was made', async () => {
    const user = userEvent.setup()
    const { onAnswer } = study(pairs)
    await user.click(btn('Reveal answers'))
    expect(screen.getByText(/Toggle autopilot/).getAttribute('aria-hidden')).not.toBe('true')
    expect(pressed('I got it')).toBe('false')
    expect(pressed('I missed')).toBe('false')

    await user.click(btn('I missed'))

    expect(onAnswer).toHaveBeenCalledExactlyOnceWith('q1', 'self-wrong', false)
    expect(pressed('I missed')).toBe('true')
    expect(pressed('I got it')).toBe('false')
    expect(btn('I got it').getAttribute('aria-disabled')).toBe('true')
    expect(screen.getByText('✕ Incorrect')).toBeTruthy()
    expect(screen.getByText('Because reasons.')).toBeTruthy()
  })

  it('"I got it" grades the item correct', async () => {
    const user = userEvent.setup()
    const { onAnswer } = study(pairs)
    await user.click(btn('Reveal answers'))
    await user.click(btn('I got it'))
    expect(onAnswer).toHaveBeenCalledExactlyOnceWith('q1', 'self-correct', true)
    expect(screen.getByText('✓ Correct')).toBeTruthy()
  })

  it('is operable from the keyboard', async () => {
    const user = userEvent.setup()
    const { onAnswer } = study(pairs)
    btn('Reveal answers').focus()
    await user.keyboard('{Enter}')
    // The reveal button unmounts; focus must land on the grading controls, not <body>.
    expect(document.activeElement).toBe(btn('I got it'))
    await user.keyboard(' ')
    expect(onAnswer).toHaveBeenCalledExactlyOnceWith('q1', 'self-correct', true)
    // Grading locks the choice without dropping focus, and a second press records nothing.
    expect(document.activeElement).toBe(btn('I got it'))
    await user.keyboard(' ')
    expect(onAnswer).toHaveBeenCalledOnce()
  })
})

describe('match pairs in mock mode', () => {
  it('self-mark is a visible, changeable selection and answers stay hidden', async () => {
    const user = userEvent.setup()
    const onAnswer = vi.fn()
    const onNext = vi.fn()
    render(<MockHarness question={pairs} onAnswer={onAnswer} onNext={onNext} />)

    await user.click(btn('I got it'))
    expect(pressed('I got it')).toBe('true')
    await user.click(btn('I missed'))
    expect(pressed('I missed')).toBe('true')
    expect(pressed('I got it')).toBe('false')
    expect(onAnswer).not.toHaveBeenCalled()
    expect(screen.getByText(/Toggle autopilot/).getAttribute('aria-hidden')).toBe('true')

    await user.click(btn('Save and continue'))
    expect(onAnswer).toHaveBeenCalledOnce()
    expect(onNext).toHaveBeenCalledOnce()
    expect(screen.queryByText('Because reasons.')).toBeNull()
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
