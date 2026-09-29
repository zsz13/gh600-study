import type { Question } from '../types'

// Multi-part questions: each slot (a placeholder in code or in a statement, a requirement filled from a
// shared answer bank, or a statement in a Yes/No grid) is answered and graded on its own.
const SLOT_TYPES: ReadonlySet<string> = new Set(['code_fill', 'text_fill', 'answer_bank', 'yes_no_grid'])
export const isSlotQuestion = (q: Pick<Question, 'type'>): boolean => SLOT_TYPES.has(q.type)

export const DEFAULT_LABELS: [string, string] = ['Yes', 'No']

// A placeholder in a fill template: [[1]], [[2]], … numbered from 1 in slot order.
export const PLACEHOLDER = /\[\[(\d+)\]\]/

// The choices one slot is answered from: a placeholder's own dropdown, the shared bank, or the grid's labels.
export function slotChoices(q: Question, slot: number): string[] {
  if (q.type === 'answer_bank') return q.bank ?? []
  if (q.type === 'yes_no_grid') return q.labels ?? DEFAULT_LABELS
  return q.slots?.[slot]?.options ?? []
}

// Each slot's correct choice, as an index into that slot's choices.
export const slotKey = (q: Question): number[] =>
  (q.slots ?? []).map((slot, i) => slotChoices(q, i).indexOf(slot.answer))

// A slot answer lists, for each slot in data order, the index of the choice picked for it ("2,0,,1" while
// the third is still empty); indices, since choices can contain commas. As with match pairs, only that
// exact form counts: a wrong part count, an out-of-range or non-canonical index, or (in an answer bank,
// where each answer is used once) a repeated one reads as unanswered.
export function slotPicks(q: Question, given: string): (number | undefined)[] {
  const size = q.slots?.length ?? 0
  const parts = given.split(',')
  if (parts.length !== size) return Array.from({ length: size }, () => undefined)
  const taken = new Set<number>()
  return parts.map((part, i) => {
    const pick = Number(part)
    if (String(pick) !== part || pick < 0 || pick >= slotChoices(q, i).length) return undefined
    if (q.type === 'answer_bank') {
      if (taken.has(pick)) return undefined
      taken.add(pick)
    }
    return pick
  })
}

export const joinPicks = (picks: (number | undefined)[]): string => picks.map((pick) => pick ?? '').join(',')

// Per-slot grading: how many slots hold their key's choice, out of how many slots there are.
export function slotScore(q: Question, given: string): { hits: number; total: number } {
  const key = slotKey(q)
  const hits = slotPicks(q, given).filter((pick, i) => pick === key[i]).length
  return { hits, total: key.length }
}
