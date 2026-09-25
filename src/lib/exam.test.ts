import { describe, expect, it } from 'vitest'
import type { Domain } from '../types'
import { ALL_QUESTIONS, flattenQuestions } from './exam'

const SEP = ' -> '

describe('question bank', () => {
  it('ids are unique', () => {
    const ids = ALL_QUESTIONS.map((q) => q.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it.each(ALL_QUESTIONS.map((q) => [q.id, q] as const))('%s is answerable', (_id, q) => {
    switch (q.type) {
      case 'multiple_choice':
      case 'multi_select': {
        expect(q.options?.length).toBeGreaterThan(1)
        const letters = q.options!.map((o, i) => o.match(/^([A-Z])\./)?.[1] ?? String.fromCharCode(65 + i))
        for (const c of q.correct!.split(',')) expect(letters).toContain(c.trim().toUpperCase())
        break
      }
      case 'drag_drop_order':
        // The answer is serialized with SEP, so options must not contain it.
        for (const o of q.options!) expect(o).not.toContain(SEP)
        expect(new Set(q.options).size).toBe(q.options!.length) // steps are React keys
        expect([...q.correct!.split(SEP)].sort()).toEqual([...q.options!].sort())
        break
      case 'fill_blank':
        expect(q.correct?.trim()).toBeTruthy()
        break
      case 'match_pairs':
        expect(q.pairs?.length).toBeGreaterThan(1)
        expect(new Set(q.pairs!.map((p) => p.left)).size).toBe(q.pairs!.length) // left sides are React keys
        break
      default:
        // case_study parents carry no controls; their context is folded into each sub-question.
        throw new Error(`unanswerable question type in the bank: ${q.type}`)
    }
  })
})

describe('flattenQuestions', () => {
  it('serves the D4 4.3 "never runs the test command" case study only through its sub-question', () => {
    const ids = ALL_QUESTIONS.filter((q) => q.stem.includes('never runs the test command')).map((q) => q.id)
    expect(ids).toEqual(['d4-4.3-60-sub0']) // not the control-less parent d4-4.3-59
    const sub = ALL_QUESTIONS.find((q) => q.id === 'd4-4.3-60-sub0')!
    expect(sub.type).toBe('multiple_choice')
    expect(sub.options).toHaveLength(4)
    expect(sub.stem).toMatch(/^\[Case study context\] After three failed runs/)
  })

  it('keeps the ids already stored in users\' progress', () => {
    const byStem = (s: string) => ALL_QUESTIONS.find((q) => q.stem.startsWith(s))?.id
    expect(byStem('Match the CLI control to its purpose.')).toBe('d6-6.1-71')
  })

  it('folds case studies into their sub-questions and keeps ids stable', () => {
    const mc = { type: 'multiple_choice' as const, stem: 'q', domain: '1.1', options: ['A. a', 'B. b'], correct: 'A' }
    const domains: Domain[] = [
      {
        domain_id: 1,
        title: 'D',
        weight_pct: '10',
        objectives: [
          {
            id: '1.1',
            title: 'O',
            questions: [
              mc,
              { type: 'case_study', stem: 'Context', domain: '1.1', sub_questions: [mc, mc] },
              mc,
            ],
          },
        ],
      },
    ]
    const flat = flattenQuestions(domains)
    // Ids are persisted in localStorage progress; the case-study parent still consumes a slot.
    expect(flat.map((q) => q.id)).toEqual(['d1-1.1-1', 'd1-1.1-3-sub0', 'd1-1.1-4-sub1', 'd1-1.1-5'])
    expect(flat[1].stem).toContain('Context')
  })
})
