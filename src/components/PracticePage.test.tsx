import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent, { type UserEvent } from '@testing-library/user-event'
import type { AppState } from '../types'
import PracticePage from './PracticePage'

afterEach(cleanup)

const EMPTY: AppState = { planChecks: {}, reviewed: {}, questionAttempts: {}, flagged: {}, mockRuns: [] }

function Harness() {
  const [state, setState] = useState<AppState>(EMPTY)
  return <PracticePage state={state} setState={setState} />
}

const card = () => screen.getByRole('article')
const stem = () => within(card()).getByRole('heading').textContent

// Answers whatever question type is on screen, the way a user would.
async function answerCurrent(user: UserEvent) {
  const c = within(card())
  const reveal = c.queryByRole('button', { name: 'Reveal answers' })
  if (reveal) {
    await user.click(reveal)
    await user.click(c.getByRole('button', { name: 'I got it' }))
    return
  }
  const input = c.queryByRole('textbox')
  if (input) await user.type(input, 'x')
  const options = c.queryAllByRole('button', { pressed: false }).filter((b) => b.closest('ul'))
  if (options.length) await user.click(options[0])
  await user.click(c.getByRole('button', { name: 'Check answer' }))
}

describe('practice session', () => {
  it.each(['Shuffle', 'Unseen'])('keeps the answered question on screen in %s mode', async (mode) => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: mode }))
    const before = stem()

    await answerCurrent(user)

    expect(stem()).toBe(before)
    expect(within(card()).getByText(/✓ Correct|✕ Incorrect/)).toBeTruthy()
  })

  it('keeps the question on screen when it is flagged in Shuffle mode', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Shuffle' }))
    const before = stem()
    await user.click(within(card()).getByRole('button', { name: /Flag/ }))
    expect(stem()).toBe(before)
    expect(within(card()).getByRole('button', { name: /Flagged/ }).getAttribute('aria-pressed')).toBe('true')
  })

  it('moves keyboard focus to the next question when Next is pressed', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    within(card()).getByRole('button', { name: 'Next ▸' }).focus()
    await user.keyboard('{Enter}')
    expect(document.activeElement).toBe(within(card()).getByRole('heading'))
  })

  it('every question in the bank can be answered and graded', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const total = Number(screen.getByText(/\d+ \/ \d+/).textContent!.split('/')[1])
    for (let i = 0; i < total; i++) {
      await answerCurrent(user)
      expect(within(card()).getByText(/✓ Correct|✕ Incorrect/)).toBeTruthy()
      if (i < total - 1) await user.click(within(card()).getByRole('button', { name: 'Next ▸' }))
    }
  }, 60_000)
})
