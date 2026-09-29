import { describe, expect, it } from 'vitest'
import type { FlatQuestion, Question } from '../types'
import { answerCredit, gradeMock, isCorrect, mockScore } from './exam'
import type { MockResult } from './exam'
import { isSlotQuestion, joinPicks, slotChoices, slotKey, slotPicks, slotScore } from './slots'

const code: Question = {
  type: 'code_fill',
  domain: '5.1',
  stem: 'Complete it',
  template: 'jobs:\n  merge:\n    [[1]]: [a, b]\n    if: ${{ [[2]] }}\n    steps:\n      - uses: [[3]]',
  slots: [
    { options: ['concurrency', 'needs'], answer: 'needs', explanation: 'orders jobs' },
    { options: ['always()', '!cancelled()', 'success()'], answer: '!cancelled()', explanation: 'not on cancel' },
    { options: ['actions/upload-artifact@v4', 'actions/download-artifact@v4'], answer: 'actions/download-artifact@v4', explanation: 'gets files' },
  ],
}
const text: Question = { ...code, type: 'text_fill', template: '[[1]] then [[2]] then [[3]]' }
const bank: Question = {
  type: 'answer_bank',
  domain: '5.1',
  stem: 'Assign',
  bank: ['upload', 'download', 'needs', 'concurrency', 'matrix', 'workflow_run'],
  slots: [
    { prompt: 'Persist', answer: 'upload', explanation: 'x' },
    { prompt: 'Retrieve', answer: 'download', explanation: 'x' },
    { prompt: 'Wait', answer: 'needs', explanation: 'x' },
  ],
}
const grid: Question = {
  type: 'yes_no_grid',
  domain: '5.1',
  stem: 'Evaluate',
  slots: [
    { prompt: 'One', answer: 'Yes', explanation: 'x' },
    { prompt: 'Two', answer: 'No', explanation: 'x' },
    { prompt: 'Three', answer: 'No', explanation: 'x' },
  ],
}
const trueFalse: Question = { ...grid, labels: ['True', 'False'], slots: grid.slots!.map((s) => ({ ...s, answer: s.answer === 'Yes' ? 'True' : 'False' })) }

describe('slot questions: choices and key', () => {
  it('are the multi-part types only', () => {
    for (const q of [code, text, bank, grid]) expect(isSlotQuestion(q)).toBe(true)
    for (const type of ['multiple_choice', 'multi_select', 'drag_drop_order', 'fill_blank', 'match_pairs', 'case_study'] as const)
      expect(isSlotQuestion({ type })).toBe(false)
  })

  it("answer each slot from its own dropdown, the shared bank, or the grid's labels", () => {
    expect(slotChoices(code, 1)).toEqual(['always()', '!cancelled()', 'success()'])
    expect(slotChoices(bank, 2)).toBe(bank.bank)
    expect(slotChoices(grid, 0)).toEqual(['Yes', 'No'])
    expect(slotChoices(trueFalse, 0)).toEqual(['True', 'False'])
  })

  it('key each slot by the index of its answer among its choices', () => {
    expect(slotKey(code)).toEqual([1, 1, 1])
    expect(slotKey(text)).toEqual([1, 1, 1])
    expect(slotKey(bank)).toEqual([0, 1, 2])
    expect(slotKey(grid)).toEqual([0, 1, 1])
    expect(slotKey(trueFalse)).toEqual([0, 1, 1])
  })
})

describe('slot questions: parsing a stored answer', () => {
  it('reads one index per slot, and an empty part as unanswered', () => {
    expect(slotPicks(code, '1,,0')).toEqual([1, undefined, 0])
    expect(slotPicks(code, '')).toEqual([undefined, undefined, undefined])
    expect(slotPicks(grid, '0,1,1')).toEqual([0, 1, 1])
  })

  it('reads a wrong part count, or anything not a canonical in-range index, as unanswered', () => {
    expect(slotPicks(code, '1,1')).toEqual([undefined, undefined, undefined])
    expect(slotPicks(code, '1,1,1,1')).toEqual([undefined, undefined, undefined])
    expect(slotPicks(code, '2,3,-1')).toEqual([undefined, undefined, undefined]) // slot 1 has 2 choices
    expect(slotPicks(code, ' 1,01,1.0')).toEqual([undefined, undefined, undefined])
    expect(slotPicks(grid, '2,x,1')).toEqual([undefined, undefined, 1])
  })

  it('uses a bank answer once: a repeat reads as unanswered, while fills and grids may repeat a choice', () => {
    expect(slotPicks(bank, '2,2,0')).toEqual([2, undefined, 0])
    expect(slotPicks(code, '1,1,1')).toEqual([1, 1, 1])
    expect(slotPicks(grid, '1,1,1')).toEqual([1, 1, 1])
  })

  it('writes picks back in the same form', () => {
    expect(joinPicks([1, undefined, 0])).toBe('1,,0')
    for (const given of ['1,,0', '0,1,1', ',,']) expect(joinPicks(slotPicks(code, given))).toBe(given)
  })
})

describe('slot questions: scoring', () => {
  it.each([
    ['code_fill', code, '1,1,1', '1,0,1', '0,0,0'],
    ['text_fill', text, '1,1,1', '0,1,1', '0,0,0'],
    ['answer_bank', bank, '0,1,2', '0,1,3', '3,4,5'],
    ['yes_no_grid', grid, '0,1,1', '0,1,0', '1,0,0'],
    ['True/False grid', trueFalse, '0,1,1', '1,1,1', '1,0,0'],
  ])('%s: all or nothing for "correct", per slot for credit', (_type, q, key, twoOfThree, none) => {
    expect(slotScore(q, key)).toEqual({ hits: 3, total: 3 })
    expect(isCorrect(q, key)).toBe(true)
    expect(answerCredit(q, key)).toBe(1)

    expect(slotScore(q, twoOfThree)).toEqual({ hits: 2, total: 3 })
    expect(isCorrect(q, twoOfThree)).toBe(false)
    expect(answerCredit(q, twoOfThree)).toBeCloseTo(2 / 3)

    expect(isCorrect(q, none)).toBe(false)
    expect(answerCredit(q, none)).toBe(0)
  })

  it('gives an unanswered or unreadable answer no credit', () => {
    expect(answerCredit(code, undefined)).toBe(0)
    expect(answerCredit(code, '')).toBe(0)
    expect(answerCredit(code, '1,1')).toBe(0)
    expect(isCorrect(code, '')).toBe(false)
    // A bank answer placed twice counts once, at the first slot that took it.
    expect(slotScore(bank, '0,0,2')).toEqual({ hits: 2, total: 3 })
  })

  it('never grades a question without slots as correct', () => {
    const empty: Question = { ...code, slots: [] }
    expect(slotScore(empty, '')).toEqual({ hits: 0, total: 0 })
    expect(isCorrect(empty, '')).toBe(false)
    expect(answerCredit(empty, ',')).toBe(0)
  })
})

describe('existing question types keep their scoring', () => {
  const base = { domain: '1.1' }
  it.each<[string, Question, string, string]>([
    ['multiple_choice', { ...base, type: 'multiple_choice', stem: 's', options: ['A. a', 'B. b'], correct: 'B' }, 'B', 'A'],
    ['multi_select', { ...base, type: 'multi_select', stem: 's', options: ['A. a', 'B. b', 'C. c'], correct: 'A,C' }, 'A,C', 'A'],
    ['drag_drop_order', { ...base, type: 'drag_drop_order', stem: 's', options: ['x', 'y'], correct: 'x -> y' }, 'x -> y', 'y -> x'],
    ['fill_blank', { ...base, type: 'fill_blank', stem: 's', correct: 'Needs' }, ' needs ', 'need'],
    [
      'match_pairs',
      { ...base, type: 'match_pairs', stem: 's', pairs: [{ left: 'a', right: '1' }, { left: 'b', right: '2' }, { left: 'c', right: '3' }] },
      '0,1,2',
      '0,2,1', // one of three pairs right still earns nothing
    ],
  ])('%s: a full point or none', (_type, q, right, wrong) => {
    expect(isCorrect(q, right)).toBe(true)
    expect(answerCredit(q, right)).toBe(1)
    expect(isCorrect(q, wrong)).toBe(false)
    expect(answerCredit(q, wrong)).toBe(0)
  })
})

describe('mock score with multi-part questions', () => {
  const flat = (q: Question, id: string): FlatQuestion => ({ ...q, id, domainId: 5, domainTitle: 'D5', objectiveId: '5.1', objectiveTitle: 'O' })
  const result = (q: Question, id: string, given?: string): MockResult => ({
    question: flat(q, id),
    number: 1,
    given,
    correct: !!given && isCorrect(q, given),
    credit: answerCredit(q, given),
    flagged: false,
  })

  it('adds per-slot credit, so a partly right answer counts for part of its point', () => {
    const results = [result(code, 'a', '1,1,1'), result(bank, 'b', '0,1,3'), result(grid, 'c')]
    // (1 + 2/3 + 0) / 3 = 0.5556
    expect(mockScore(results)).toBe(556)
    expect(results.map((r) => r.correct)).toEqual([true, false, false])
  })

  it('grades a saved run from the bank the same way', () => {
    const run = { startedAt: 0, finishedAt: 1, questionIds: ['ap-wf-1', 'ap-grid-3'], answers: { 'ap-wf-1': '1,2,0', 'ap-grid-3': '0,1,0,0' } }
    const results = gradeMock(run)
    // ap-wf-1: all three placeholders right; ap-grid-3: 3 of 4 statements right.
    expect(results.map((r) => [r.correct, r.credit])).toEqual([
      [true, 1],
      [false, 0.75],
    ])
    expect(mockScore(results)).toBe(875)
  })
})
