import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { CaseStudy, FlatQuestion } from '../types'
import QuestionCard from './QuestionCard'

afterEach(cleanup)

const base = {
  domain: '5.1',
  domainId: 5,
  domainTitle: 'Domain',
  objectiveId: '5.1',
  objectiveTitle: 'Objective',
  explanation: 'The concept, explained.',
}

const code: FlatQuestion = {
  ...base,
  id: 'code',
  type: 'code_fill',
  stem: 'Complete the merge job.',
  template: 'merge:\n  [[1]]: [a, b]\n  if: ${{ [[2]] }}\n  steps:\n    - uses: [[3]]',
  slots: [
    { options: ['concurrency', 'needs'], answer: 'needs', explanation: 'needs orders jobs.' },
    { options: ['always()', '!cancelled()'], answer: '!cancelled()', explanation: 'Not after a cancellation.' },
    { options: ['actions/upload-artifact@v4', 'actions/download-artifact@v4'], answer: 'actions/download-artifact@v4', explanation: 'Download gets the files.' },
  ],
}

const text: FlatQuestion = {
  ...base,
  id: 'text',
  type: 'text_fill',
  stem: 'Complete the statement.',
  template: 'Configure [[1]] at the [[2]] level.',
  slots: [
    { options: ['`needs`', '`concurrency`'], answer: '`concurrency`', explanation: 'Relates runs.' },
    { options: ['job', 'workflow'], answer: 'workflow', explanation: 'Whole run.' },
  ],
}

const bank: FlatQuestion = {
  ...base,
  id: 'bank',
  type: 'answer_bank',
  stem: 'Assign the feature that meets each requirement.',
  bank: ['`upload-artifact`', '`download-artifact`', '`needs`', '`concurrency`', '`strategy.matrix`', '`workflow_run`'],
  slots: [
    { prompt: 'Persist analysis output', answer: '`upload-artifact`', explanation: 'Upload stores it.' },
    { prompt: "Retrieve an earlier job's report", answer: '`download-artifact`', explanation: 'Download fetches it.' },
    { prompt: 'Make the merge job wait', answer: '`needs`', explanation: 'needs orders jobs.' },
  ],
}

const grid: FlatQuestion = {
  ...base,
  id: 'grid',
  type: 'yes_no_grid',
  stem: 'Evaluate each statement.',
  slots: [
    { prompt: 'Planner and reviewer can start together.', answer: 'Yes', explanation: 'No needs between them.' },
    { prompt: 'The merger starts before both finish.', answer: 'No', explanation: 'It waits for all.' },
    { prompt: 'A failed dependency skips the merger.', answer: 'Yes', explanation: 'Default success().' },
  ],
}

const btn = (name: string | RegExp) => screen.getByRole('button', { name })
const checkButton = () => btn('Check answer') as HTMLButtonElement
const placeholder = (n: number) => screen.getByRole('combobox', { name: `Placeholder ${n}` }) as HTMLSelectElement
const chip = (text: string) => within(screen.getByRole('group', { name: 'Answer bank' })).getByRole('button', { name: (n) => n === text || n.startsWith(`${text}, placed`) })
const requirement = (n: number) => screen.getByRole('button', { name: new RegExp(`^Requirement ${n}, `) })
const statement = (text: string) => screen.getByRole('radiogroup', { name: text })
const announced = () => screen.getByRole('status').textContent

function study(question: FlatQuestion, props: Partial<Parameters<typeof QuestionCard>[0]> = {}) {
  const onAnswer = vi.fn()
  render(<QuestionCard question={question} index={0} total={3} mode="study" onAnswer={onAnswer} onNext={vi.fn()} {...props} />)
  return { onAnswer }
}

// Mirrors MockExamPage: the saved answer is fed back in as initialAnswer.
function MockHarness({ question, onAnswer }: { question: FlatQuestion; onAnswer: () => void }) {
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
      onNext={vi.fn()}
    />
  )
}

// Nothing that gives the key away: no verdict, correct values or explanations.
const REVEALING = /Correct answer|Your answers|Explanation|✓ Correct|◐ Partly|✕ Incorrect|needs orders jobs/

describe('code placeholders', () => {
  it('shows the snippet as code with a dropdown per placeholder, all empty, and reveals nothing', () => {
    study(code)
    const snippet = screen.getByText(/merge:/, { selector: 'code' })
    expect(snippet.textContent).toContain('if: ${{')
    expect(within(snippet).getAllByRole('combobox')).toHaveLength(3)
    for (const n of [1, 2, 3]) {
      expect(placeholder(n).value).toBe('')
      expect(within(placeholder(n)).getByRole('option', { name: 'Choose…' })).toBeTruthy()
    }
    expect(screen.getByText('0 of 3 placeholders chosen')).toBeTruthy()
    expect(checkButton().disabled).toBe(true)
    expect(screen.queryByText(REVEALING)).toBeNull()
  })

  it('stays unanswered until every placeholder is chosen', async () => {
    const user = userEvent.setup()
    study(code)
    await user.selectOptions(placeholder(1), 'needs')
    await user.selectOptions(placeholder(3), 'actions/download-artifact@v4')
    expect(screen.getByText('2 of 3 placeholders chosen')).toBeTruthy()
    expect(checkButton().disabled).toBe(true)
    await user.selectOptions(placeholder(2), '!cancelled()')
    expect(screen.getByText('3 of 3 placeholders chosen')).toBeTruthy()
    expect(checkButton().disabled).toBe(false)
  })

  it('grades a fully right answer as correct, locks it, and explains every placeholder', async () => {
    const user = userEvent.setup()
    const { onAnswer } = study(code)
    await user.selectOptions(placeholder(1), 'needs')
    await user.selectOptions(placeholder(2), '!cancelled()')
    await user.selectOptions(placeholder(3), 'actions/download-artifact@v4')
    await user.click(checkButton())

    expect(onAnswer).toHaveBeenCalledOnce()
    expect(onAnswer).toHaveBeenCalledWith('code', '1,1,1', true)
    expect(screen.getByText('✓ Correct · 3 of 3 placeholders')).toBeTruthy()
    expect(screen.queryAllByRole('combobox')).toEqual([]) // locked
    // The completed snippet shows each choice, marked right in words as well as with a glyph.
    expect(screen.getByText(/merge:/, { selector: 'code' }).textContent).toMatch(/needs ✓ \(correct\): \[a, b\]/)
    expect(screen.getByText('Your answers · 3 of 3 correct')).toBeTruthy()
    for (const why of ['needs orders jobs.', 'Not after a cancellation.', 'Download gets the files.']) expect(screen.getByText(why)).toBeTruthy()
    expect(screen.getByText('The concept, explained.')).toBeTruthy()
  })

  it('grades a partly right answer per placeholder, and shows the correct value where it differs', async () => {
    const user = userEvent.setup()
    const { onAnswer } = study(code)
    await user.selectOptions(placeholder(1), 'needs')
    await user.selectOptions(placeholder(2), 'always()')
    await user.selectOptions(placeholder(3), 'actions/download-artifact@v4')
    await user.click(checkButton())

    expect(onAnswer).toHaveBeenCalledWith('code', '1,0,1', false)
    expect(screen.getByText('◐ Partly correct · 2 of 3 placeholders').className).toContain('chip-warn')
    const review = screen.getByText('Your answers · 2 of 3 correct').parentElement!
    const second = within(review).getAllByRole('listitem')[1]
    expect(second.textContent).toContain('Placeholder 2')
    expect(second.textContent).toMatch(/Your answer: always\(\) ✕incorrect/)
    expect(second.textContent).toContain('Correct answer: !cancelled()')
    expect(within(review).getAllByText(/^Correct answer:/)).toHaveLength(1) // only where it differs
  })

  it('grades an answer with no placeholder right as incorrect', async () => {
    const user = userEvent.setup()
    study(code)
    await user.selectOptions(placeholder(1), 'concurrency')
    await user.selectOptions(placeholder(2), 'always()')
    await user.selectOptions(placeholder(3), 'actions/upload-artifact@v4')
    await user.click(checkButton())
    expect(screen.getByText('✕ Incorrect · 0 of 3 placeholders').className).toContain('chip-bad')
  })
})

describe('statement placeholders', () => {
  it('places each dropdown inline in the statement, with markup read as plain text', async () => {
    const user = userEvent.setup()
    const { onAnswer } = study(text)
    const sentence = screen.getByText(/^Configure/, { selector: 'p' })
    expect(within(sentence).getAllByRole('combobox')).toHaveLength(2)
    expect(within(placeholder(1)).getAllByRole('option').map((o) => o.textContent)).toEqual(['Choose…', 'needs', 'concurrency'])
    await user.selectOptions(placeholder(1), 'concurrency')
    await user.selectOptions(placeholder(2), 'workflow')
    await user.click(checkButton())
    expect(onAnswer).toHaveBeenCalledWith('text', '1,1', true)
    expect(screen.getByText('✓ Correct · 2 of 2 placeholders')).toBeTruthy()
  })
})

describe('answer bank', () => {
  it('lists every answer and every requirement, all empty, and reveals nothing', () => {
    study(bank)
    const answers = within(screen.getByRole('group', { name: 'Answer bank' })).getAllByRole('button')
    expect(answers.map((a) => a.getAttribute('aria-label')).sort()).toEqual(
      ['concurrency', 'download-artifact', 'needs', 'strategy.matrix', 'upload-artifact', 'workflow_run'],
    )
    for (const n of [1, 2, 3]) expect(requirement(n).getAttribute('aria-label')).toBe(`Requirement ${n}, empty`)
    expect(requirement(1).getAttribute('aria-describedby')).toBeTruthy() // the requirement text describes it
    expect(screen.getByText('0 of 3 requirements filled')).toBeTruthy()
    expect(checkButton().disabled).toBe(true)
    expect(screen.queryByText(REVEALING)).toBeNull()
  })

  it('places an answer by tapping it, then a requirement', async () => {
    const user = userEvent.setup()
    study(bank)
    await user.click(chip('needs'))
    expect(chip('needs').getAttribute('aria-pressed')).toBe('true')
    expect(announced()).toBe('Selected needs. Now choose the requirement to place it in.')
    await user.click(requirement(3))
    expect(requirement(3).getAttribute('aria-label')).toBe('Requirement 3, holds needs')
    expect(chip('needs').getAttribute('aria-label')).toBe('needs, placed in requirement 3')
    expect(chip('needs').getAttribute('aria-pressed')).toBe('false')
    expect(announced()).toBe('Placed needs in requirement 3.')
  })

  it('uses each answer once: placing it again moves it, and a displaced answer returns to the bank', async () => {
    const user = userEvent.setup()
    study(bank)
    await user.click(chip('needs'))
    await user.click(requirement(1))
    await user.click(chip('needs'))
    await user.click(requirement(2))
    expect(requirement(1).getAttribute('aria-label')).toBe('Requirement 1, empty')
    expect(requirement(2).getAttribute('aria-label')).toBe('Requirement 2, holds needs')
    expect(announced()).toBe('Placed needs in requirement 2. Requirement 1 is empty again.')

    await user.click(chip('concurrency'))
    await user.click(requirement(2))
    expect(requirement(2).getAttribute('aria-label')).toBe('Requirement 2, holds concurrency')
    expect(chip('needs').getAttribute('aria-label')).toBe('needs')
    expect(announced()).toBe('Placed concurrency in requirement 2. needs is back in the answer bank.')
  })

  it('moves a placed answer by tapping its requirement, then another', async () => {
    const user = userEvent.setup()
    study(bank)
    await user.click(requirement(1))
    expect(announced()).toBe('Choose an answer from the answer bank first.')
    await user.click(chip('needs'))
    await user.click(requirement(1))
    await user.click(requirement(1)) // picks it up
    expect(chip('needs').getAttribute('aria-pressed')).toBe('true')
    await user.click(requirement(3))
    expect(requirement(1).getAttribute('aria-label')).toBe('Requirement 1, empty')
    expect(requirement(3).getAttribute('aria-label')).toBe('Requirement 3, holds needs')
  })

  it('removes an answer from its requirement', async () => {
    const user = userEvent.setup()
    study(bank)
    await user.click(chip('needs'))
    await user.click(requirement(1))
    await user.click(btn('Remove needs from requirement 1'))
    expect(requirement(1).getAttribute('aria-label')).toBe('Requirement 1, empty')
    expect(announced()).toBe('needs is back in the answer bank. Requirement 1 is empty.')
  })

  it('drags an answer onto a requirement with the mouse, and back to the bank', () => {
    study(bank)
    fireEvent.dragStart(chip('upload-artifact'))
    fireEvent.dragOver(requirement(1).closest('li')!)
    expect(requirement(1).closest('li')!.className).toContain('border-accent') // drop target highlighted
    fireEvent.drop(requirement(1).closest('li')!)
    expect(requirement(1).getAttribute('aria-label')).toBe('Requirement 1, holds upload-artifact')

    // A placed answer can be dragged on to another requirement…
    fireEvent.dragStart(requirement(1))
    fireEvent.dragOver(requirement(2))
    fireEvent.drop(requirement(2))
    expect(requirement(1).getAttribute('aria-label')).toBe('Requirement 1, empty')
    expect(requirement(2).getAttribute('aria-label')).toBe('Requirement 2, holds upload-artifact')

    // …or back to the bank.
    fireEvent.dragStart(requirement(2))
    fireEvent.drop(screen.getByRole('group', { name: 'Answer bank' }))
    expect(requirement(2).getAttribute('aria-label')).toBe('Requirement 2, empty')
  })

  it('ignores a drop that did not start from one of its answers', () => {
    study(bank)
    fireEvent.dragOver(requirement(1))
    fireEvent.drop(requirement(1))
    expect(requirement(1).getAttribute('aria-label')).toBe('Requirement 1, empty')
  })

  it('on touch, fills every requirement with taps alone, without dragging', async () => {
    const user = userEvent.setup()
    study(bank)
    const tap = (target: Element) => user.pointer({ keys: '[TouchA]', target })
    await tap(chip('upload-artifact'))
    await tap(requirement(1))
    await tap(chip('download-artifact'))
    await tap(requirement(2))
    await tap(chip('needs'))
    await tap(requirement(3))
    expect(screen.getByText('3 of 3 requirements filled')).toBeTruthy()
    expect(checkButton().disabled).toBe(false)
  })

  it('is operable from the keyboard', async () => {
    const user = userEvent.setup()
    study(bank)
    chip('needs').focus()
    await user.keyboard('{Enter}')
    requirement(3).focus()
    await user.keyboard(' ')
    expect(requirement(3).getAttribute('aria-label')).toBe('Requirement 3, holds needs')
  })

  it('grades per requirement, then replaces the bank with the results', async () => {
    const user = userEvent.setup()
    const { onAnswer } = study(bank)
    for (const [answer, n] of [['upload-artifact', 1], ['workflow_run', 2], ['needs', 3]] as const) {
      await user.click(chip(answer))
      await user.click(requirement(n))
    }
    await user.click(checkButton())
    expect(onAnswer).toHaveBeenCalledWith('bank', '0,5,2', false)
    expect(screen.getByText('◐ Partly correct · 2 of 3 requirements')).toBeTruthy()
    expect(screen.queryByRole('group', { name: 'Answer bank' })).toBeNull()
    const second = within(screen.getByText('Your answers · 2 of 3 correct').parentElement!).getAllByRole('listitem')[1]
    expect(second.textContent).toMatch(/Retrieve an earlier job's report.*Your answer: workflow_run.*Correct answer: download-artifact.*Download fetches it\./)
  })
})

describe('statement grid', () => {
  it('asks each statement separately, named by the statement, and needs every one answered', async () => {
    const user = userEvent.setup()
    study(grid)
    expect(screen.getAllByRole('radiogroup')).toHaveLength(3)
    expect(within(statement('Planner and reviewer can start together.')).getAllByRole('radio').map((r) => r.closest('label')!.textContent)).toEqual(['Yes', 'No'])
    expect(screen.getByText('0 of 3 statements answered')).toBeTruthy()
    await user.click(within(statement('Planner and reviewer can start together.')).getByRole('radio', { name: 'Yes' }))
    await user.click(within(statement('The merger starts before both finish.')).getByRole('radio', { name: 'No' }))
    expect(checkButton().disabled).toBe(true)
    expect(screen.queryByText(REVEALING)).toBeNull()
    await user.click(within(statement('A failed dependency skips the merger.')).getByRole('radio', { name: 'No' }))
    expect(screen.getByText('3 of 3 statements answered')).toBeTruthy()
  })

  it('changes a statement without touching the others', async () => {
    const user = userEvent.setup()
    study(grid)
    const first = within(statement('Planner and reviewer can start together.'))
    await user.click(first.getByRole('radio', { name: 'No' }))
    await user.click(first.getByRole('radio', { name: 'Yes' }))
    expect((first.getByRole('radio', { name: 'Yes' }) as HTMLInputElement).checked).toBe(true)
    expect((first.getByRole('radio', { name: 'No' }) as HTMLInputElement).checked).toBe(false)
    expect(screen.getByText('1 of 3 statements answered')).toBeTruthy()
  })

  it('grades each statement independently', async () => {
    const user = userEvent.setup()
    const { onAnswer } = study(grid)
    for (const name of ['Planner and reviewer can start together.', 'The merger starts before both finish.', 'A failed dependency skips the merger.'])
      await user.click(within(statement(name)).getByRole('radio', { name: 'No' }))
    await user.click(checkButton())
    expect(onAnswer).toHaveBeenCalledWith('grid', '1,1,1', false)
    expect(screen.getByText('◐ Partly correct · 1 of 3 statements')).toBeTruthy()
    expect(screen.queryAllByRole('radiogroup')).toEqual([])
  })

  it('uses the question’s own labels, such as True and False', async () => {
    const user = userEvent.setup()
    const trueFalse: FlatQuestion = { ...grid, labels: ['True', 'False'], slots: grid.slots!.map((s) => ({ ...s, answer: s.answer === 'Yes' ? 'True' : 'False' })) }
    const { onAnswer } = study(trueFalse)
    for (const [name, label] of [
      ['Planner and reviewer can start together.', 'True'],
      ['The merger starts before both finish.', 'False'],
      ['A failed dependency skips the merger.', 'True'],
    ])
      await user.click(within(statement(name)).getByRole('radio', { name: label }))
    await user.click(checkButton())
    expect(onAnswer).toHaveBeenCalledWith('grid', '0,1,0', true)
    expect(screen.getByText('✓ Correct · 3 of 3 statements')).toBeTruthy()
  })
})

describe('multi-part questions in a mock', () => {
  it.each([
    ['code placeholders', code, async (user: ReturnType<typeof userEvent.setup>) => {
      await user.selectOptions(placeholder(1), 'concurrency')
      await user.selectOptions(placeholder(2), '!cancelled()')
      await user.selectOptions(placeholder(3), 'actions/upload-artifact@v4')
    }],
    ['an answer bank', bank, async (user: ReturnType<typeof userEvent.setup>) => {
      for (const [answer, n] of [['needs', 1], ['concurrency', 2], ['workflow_run', 3]] as const) {
        await user.click(chip(answer))
        await user.click(requirement(n))
      }
    }],
    ['a statement grid', grid, async (user: ReturnType<typeof userEvent.setup>) => {
      for (const group of screen.getAllByRole('radiogroup')) await user.click(within(group).getByRole('radio', { name: 'No' }))
    }],
  ])('save %s without revealing anything, and restore it editable when revisited', async (_label, question, answer) => {
    const user = userEvent.setup()
    const onAnswer = vi.fn()
    render(<MockHarness question={question} onAnswer={onAnswer} />)
    const save = () => screen.getByRole('button', { name: 'Save and continue' }) as HTMLButtonElement
    expect(save().disabled).toBe(true)
    await answer(user)
    await user.click(save())

    expect(onAnswer).toHaveBeenCalledOnce()
    expect(screen.getByText('✓ Saved')).toBeTruthy()
    expect(screen.queryByText(REVEALING)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Check answer' })).toBeNull()
    // Still editable: the controls are there, and changing an answer drops the saved mark.
    if (question === code) {
      expect(placeholder(1).value).toBe('0')
      await user.selectOptions(placeholder(1), 'needs')
    } else if (question === bank) {
      expect(requirement(1).getAttribute('aria-label')).toBe('Requirement 1, holds needs')
      await user.click(btn('Remove needs from requirement 1'))
    } else {
      const first = within(screen.getAllByRole('radiogroup')[0])
      expect((first.getByRole('radio', { name: 'No' }) as HTMLInputElement).checked).toBe(true)
      await user.click(first.getByRole('radio', { name: 'Yes' }))
    }
    expect(screen.queryByText('✓ Saved')).toBeNull()
  })

  it('restores a saved answer from storage without grading it', () => {
    render(<QuestionCard question={code} index={0} total={3} mode="mock" initialAnswer="1,0," onNext={vi.fn()} />)
    expect([1, 2, 3].map((n) => placeholder(n).value)).toEqual(['1', '0', ''])
    expect(screen.getByText('2 of 3 placeholders chosen')).toBeTruthy()
    expect(screen.queryByText(REVEALING)).toBeNull()
  })
})

describe('case-study questions', () => {
  const scenario: CaseStudy = {
    id: 'cs',
    title: 'Contoso: parallel analyzers',
    summary: 'Two analyzers and a merger run on every pull request.',
    sections: [
      { heading: 'Agents and responsibilities', items: ['`security-analyzer` is read-only.'] },
      { heading: 'Known failures', items: ['The merger failed with "Artifact not found".'] },
    ],
  }
  const first: FlatQuestion = { ...grid, id: 'cs-1', caseStudy: scenario, casePart: { index: 0, total: 8 } }
  const child: FlatQuestion = { ...grid, id: 'cs-2', caseStudy: scenario, casePart: { index: 1, total: 8 } }
  const panel = () => screen.getByText('Contoso: parallel analyzers').closest('details')!

  it('shows the shared scenario in full above the case’s first question, with its place in the set', () => {
    study(first)
    expect(panel().open).toBe(true)
    expect(within(panel()).getByText('Case study')).toBeTruthy()
    expect(within(panel()).getByText(/Question 1 of 8/)).toBeTruthy()
    const panelEl = panel()
    expect(within(panelEl).getByText('Agents and responsibilities')).toBeTruthy()
    expect(within(panelEl).getByText('security-analyzer', { selector: 'code' })).toBeTruthy()
    // The question keeps its own stem as the card's heading; the scenario is not folded into it.
    expect(screen.getByRole('heading').textContent).toBe('Evaluate each statement.')
    expect(panelEl.compareDocumentPosition(screen.getByRole('heading')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('does not repeat the scenario on the case’s later questions, but keeps it one select away', async () => {
    const user = userEvent.setup()
    study(child)
    expect(panel().open).toBe(false)
    expect(within(panel()).getByText(/Question 2 of 8/)).toBeTruthy()
    expect(within(panel()).getByText('Show the scenario')).toBeTruthy()
    await user.click(within(panel()).getByText('Contoso: parallel analyzers'))
    expect(panel().open).toBe(true)
    expect(within(panel()).getByText('Agents and responsibilities')).toBeTruthy()
  })

  it('is answered and graded like the same question on its own', async () => {
    const user = userEvent.setup()
    const { onAnswer } = study(child)
    for (const group of screen.getAllByRole('radiogroup')) await user.click(within(group).getByRole('radio', { name: 'Yes' }))
    await user.click(checkButton())
    expect(onAnswer).toHaveBeenCalledWith('cs-2', '0,0,0', false)
  })

  it('shows the scenario in a mock too, still revealing nothing', () => {
    render(<QuestionCard question={child} index={0} total={3} mode="mock" onNext={vi.fn()} />)
    expect(screen.getByText('Contoso: parallel analyzers')).toBeTruthy()
    expect(screen.queryByText(REVEALING)).toBeNull()
  })
})
