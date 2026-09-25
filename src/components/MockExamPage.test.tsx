import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent, { type UserEvent } from '@testing-library/user-event'
import type { AppState } from '../types'
import MockExamPage from './MockExamPage'

afterEach(cleanup)

const EMPTY: AppState = { planChecks: {}, reviewed: {}, questionAttempts: {}, flagged: {}, mockRuns: [] }

function Harness() {
  const [state, setState] = useState<AppState>(EMPTY)
  return <MockExamPage state={state} setState={setState} />
}

function SeededHarness({ questionIds }: { questionIds: string[] }) {
  const [state, setState] = useState<AppState>(() => ({
    ...EMPTY,
    activeMock: { startedAt: Date.now(), questionIds, answers: {} },
  }))
  return <MockExamPage state={state} setState={setState} />
}

const card = () => within(screen.getByRole('article'))
const position = () => card().getByText(/^\d+ \/ \d+$/).textContent

// Gives whatever mock question is on screen an answer, the way a user would.
async function answerCurrent(user: UserEvent) {
  const selfMark = card().queryByRole('button', { name: 'I got it' })
  const input = card().queryByRole('textbox')
  const option = card().queryAllByRole('button').find((b) => b.closest('ul'))
  if (selfMark) await user.click(selfMark)
  else if (input) await user.type(input, 'x')
  else if (option) await user.click(option)
  // ordering questions already hold their displayed order as the answer
}

describe('mock exam', () => {
  it('saving advances to a fresh question, keeps focus, and the saved answer is there on return', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Start the mock now' }))
    expect(position()).toBe('1 / 50')

    await answerCurrent(user)
    const chosen = card().queryAllByRole('button', { pressed: true }).map((b) => b.textContent)
    card().getByRole('button', { name: 'Save and continue' }).focus()
    await user.keyboard('{Enter}')

    expect(position()).toBe('2 / 50')
    expect(screen.getByText(/Answered:/).textContent).toContain('1')
    expect(document.activeElement).toBe(card().getByRole('heading'))
    // The new card must not inherit the previous question's selection.
    expect(card().queryAllByRole('button', { pressed: true }).filter((b) => !/Flag/.test(b.textContent!))).toEqual([])
    expect(card().queryByText('✓ Saved')).toBeNull()

    await user.click(card().getByRole('button', { name: '◂ Previous' }))
    expect(position()).toBe('1 / 50')
    expect(card().getByText('✓ Saved')).toBeTruthy()
    expect(card().queryAllByRole('button', { pressed: true }).map((b) => b.textContent)).toEqual(chosen)
    expect(card().queryByText('Explanation')).toBeNull()
  })

  it('skips a case-study parent id left in a mock that was saved before the parents were dropped', async () => {
    const user = userEvent.setup()
    // d4-4.3-59 is the control-less parent that used to show only "Save and continue".
    render(<SeededHarness questionIds={['d1-1.1-1', 'd4-4.3-59', 'd4-4.3-60-sub0']} />)
    expect(position()).toBe('1 / 2')
    await user.click(card().getByRole('button', { name: 'Next ▸' }))
    expect(card().getByRole('heading').textContent).toContain('never runs the test command')
    expect(card().getAllByRole('button').filter((b) => b.closest('ul'))).toHaveLength(4)
  })
})
