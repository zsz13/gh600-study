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
// The verdict chip ("✓ Correct", "✕ Incorrect · 1 of 3 pairs", "◐ Partly correct · 2 of 3 placeholders"),
// not a per-step "✓ Correct position" mark.
const VERDICT = /^(✓ Correct|✕ Incorrect|◐ Partly correct)( ·|$)/
const stem = () => within(card()).getByRole('heading').textContent

// Answers whatever question type is on screen, the way a user would.
async function answerCurrent(user: UserEvent) {
  const c = within(card())
  // Match pairs: each answer goes to the current item, and the target moves to the next unmatched one.
  const answers = c.queryByRole('group', { name: /^Answers/ })
  if (answers) for (const a of within(answers).getAllByRole('button')) await user.click(a)
  // Answer bank: tap an answer, then an empty requirement, until every requirement is filled.
  const bank = c.queryByRole('group', { name: 'Answer bank' })
  if (bank) {
    const chips = within(bank).getAllByRole('button')
    for (const [i, requirement] of c.getAllByRole('button', { name: /^Requirement \d+, empty$/ }).entries()) {
      await user.click(chips[i])
      await user.click(requirement)
    }
  }
  // Placeholders in code or a statement: a choice in each dropdown. Statement grids: one per statement.
  for (const select of c.queryAllByRole('combobox', { name: /^Placeholder \d+$/ })) await user.selectOptions(select, '0')
  for (const statement of c.queryAllByRole('radiogroup')) await user.click(within(statement).getAllByRole('radio')[0])
  const input = c.queryByRole('textbox')
  if (input) await user.type(input, 'x')
  const options = bank ? [] : c.queryAllByRole('button', { pressed: false }).filter((b) => b.closest('ul'))
  if (options.length) await user.click(options[0])
  await user.click(c.getByRole('button', { name: 'Check answer' }))
}

function SeededHarness({ seed }: { seed: AppState }) {
  const [state, setState] = useState<AppState>(seed)
  return <PracticePage state={state} setState={setState} />
}

describe('practice session', () => {
  it('drills a partly right multi-part answer again in Missed mode, and not a fully right one', async () => {
    const user = userEvent.setup()
    const attempt = (id: string, given: string, correct: boolean) => [id, [{ id, given, correct, ts: 1 }]]
    render(
      <SeededHarness
        seed={{
          ...EMPTY,
          questionAttempts: Object.fromEntries([
            attempt('ap-wf-1', '1,2,1', false), // 2 of 3 placeholders
            attempt('ap-grid-3', '0,1,0,1', true),
          ]),
        }}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Missed' }))
    expect(screen.getByText(/Current pool:/).textContent).toContain('Current pool: 1')
    expect(stem()).toContain('Two analyzer jobs each write a JSON report.')
  })


  it.each(['Shuffle', 'Unseen'])('keeps the answered question on screen in %s mode', async (mode) => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: mode }))
    const before = stem()

    await answerCurrent(user)

    expect(stem()).toBe(before)
    expect(within(card()).getByText(VERDICT)).toBeTruthy()
  })

  it('keeps the case study last and in order when the main questions are shuffled', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Shuffle' }))
    const total = Number(screen.getByText(/\d+ \/ \d+/).textContent!.split('/')[1])
    // Walk forward to the last eight positions: the case study, in order.
    for (let i = 0; i < total - 8; i++) await user.click(within(card()).getByRole('button', { name: 'Next ▸' }))
    for (let part = 1; part <= 8; part++) {
      expect(within(card()).getByText(new RegExp(`Question ${part} of 8`))).toBeTruthy()
      if (part < 8) await user.click(within(card()).getByRole('button', { name: 'Next ▸' }))
    }
  }, 60_000)

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

  it('starts a match-pairs question fresh when you come back to it, with the answers in the same order', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const next = () => user.click(within(card()).getByRole('button', { name: 'Next ▸' }))
    const answers = () => within(within(card()).getByRole('group', { name: /^Answers/ })).getAllByRole('button')
    const order = () => answers().map((a) => a.getAttribute('aria-label')!.split(', matched with')[0])
    for (let i = 0; i < 5; i++) await next()
    expect(stem()).toBe('Match each anti-pattern to the GitHub control that mitigates it.')
    const before = order()
    await user.click(answers()[0])

    await next()
    expect(within(card()).queryAllByRole('radio')).toEqual([])
    await user.click(within(card()).getByRole('button', { name: '◂ Previous' }))

    const items = within(card()).getAllByRole('radio').map((r) => r.getAttribute('aria-label'))
    expect(items.every((name) => name!.endsWith(', not matched yet'))).toBe(true)
    expect(order()).toEqual(before)
    expect((within(card()).getByRole('button', { name: 'Check answer' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('every question in the bank can be answered and graded', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const total = Number(screen.getByText(/\d+ \/ \d+/).textContent!.split('/')[1])
    for (let i = 0; i < total; i++) {
      await answerCurrent(user)
      expect(within(card()).getByText(VERDICT)).toBeTruthy()
      if (i < total - 1) await user.click(within(card()).getByRole('button', { name: 'Next ▸' }))
    }
  }, 120_000)
})
