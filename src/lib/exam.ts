import dataRaw from '../data.json'
import { EXTRA_QUESTIONS } from '../data/extra-questions'
import { APPLIED_QUESTIONS } from '../data/applied-questions'
import { CASE_STUDY_QUESTIONS } from '../data/case-studies'
import type { DataShape, Domain, FlatQuestion, MockExamRun, Question } from '../types'
import { isSlotQuestion, slotScore } from './slots'

export const data = dataRaw as unknown as DataShape

export const META = data.meta
export const DOMAINS: Domain[] = data.domains

export function flattenQuestions(domains: Domain[] = DOMAINS): FlatQuestion[] {
  const flat: FlatQuestion[] = []
  let counter = 0
  for (const dom of domains) {
    for (const obj of dom.objectives) {
      for (const q of obj.questions ?? []) {
        counter += 1
        // A case study has no controls of its own: its context is folded into each
        // sub-question below. It still takes a counter slot so persisted ids stay stable.
        if (q.type !== 'case_study') {
          flat.push({
            ...q,
            id: `d${dom.domain_id}-${obj.id}-${counter}`,
            domainId: dom.domain_id,
            domainTitle: dom.title,
            objectiveId: obj.id,
            objectiveTitle: obj.title,
          })
        }
        if (q.type === 'case_study' && q.sub_questions) {
          q.sub_questions.forEach((sq, idx) => {
            counter += 1
            flat.push({
              ...sq,
              id: `d${dom.domain_id}-${obj.id}-${counter}-sub${idx}`,
              domain: q.domain,
              stem: `[Case study context] ${q.stem}\n\n${sq.stem}`,
              domainId: dom.domain_id,
              domainTitle: dom.title,
              objectiveId: obj.id,
              objectiveTitle: obj.title,
            })
          })
        }
      }
    }
  }
  return flat
}

export const ALL_QUESTIONS: FlatQuestion[] = [
  ...flattenQuestions(),
  ...EXTRA_QUESTIONS,
  ...APPLIED_QUESTIONS,
  ...CASE_STUDY_QUESTIONS,
]

export const QUESTION_BY_ID = new Map(ALL_QUESTIONS.map((q) => [q.id, q]))

// The exam's two sections: the main questions, then the case study, whose questions share one scenario.
export const MAIN_QUESTIONS = ALL_QUESTIONS.filter((q) => !q.caseStudy)
export const CASE_QUESTIONS = ALL_QUESTIONS.filter((q) => q.caseStudy)

export const QUESTIONS_BY_DOMAIN: Record<number, FlatQuestion[]> = ALL_QUESTIONS.reduce(
  (acc, q) => {
    ;(acc[q.domainId] ||= []).push(q)
    return acc
  },
  {} as Record<number, FlatQuestion[]>,
)

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// Each question's answer order for this page session: shuffled once, then the same on every visit,
// and never the data's own order (where a match pair's answer would sit next to its item).
const answerOrders = new Map<string, number[]>()
export function answerOrder(questionId: string, size: number): number[] {
  let order = answerOrders.get(questionId)
  if (!order) {
    order = shuffle(Array.from({ length: size }, (_, choice) => choice))
    if (size > 1 && order.every((choice, i) => choice === i)) order = [...order.slice(1), order[0]]
    answerOrders.set(questionId, order)
  }
  return order
}

// A mock, laid out like the exam: `mainCount` main questions weighted by the domain weight midpoints and
// shuffled, then the whole case study, in order.
export function buildMockSet(mainCount: number): FlatQuestion[] {
  const weights: Record<number, number> = {
    1: 0.175, // 15-20
    2: 0.225, // 20-25
    3: 0.125, // 10-15
    4: 0.175, // 15-20
    5: 0.175, // 15-20
    6: 0.125, // 10-15
  }
  // Each domain's share rounded down, then the leftover questions to the largest remainders, so the
  // targets add up to exactly mainCount.
  const shares = DOMAINS.map((d) => mainCount * (weights[d.domain_id] ?? 0))
  const targets = shares.map(Math.floor)
  const byRemainder = shares.map((share, i) => ({ i, rest: share - targets[i] })).sort((a, b) => b.rest - a.rest)
  for (const { i } of byRemainder.slice(0, mainCount - targets.reduce((a, b) => a + b, 0))) targets[i] += 1
  const picks = DOMAINS.flatMap((d, i) =>
    shuffle(MAIN_QUESTIONS.filter((q) => q.domainId === d.domain_id)).slice(0, targets[i]),
  )
  return [...shuffle(picks), ...CASE_QUESTIONS]
}

export function normalizeAnswer(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

// A match-pairs answer lists, for each left-hand item in data order, the index in `pairs` of the
// right-hand value chosen for it ("2,0,,1" while one is still unchosen). Indices rather than text,
// since some right-hand values contain commas. Only that exact form counts, so a complete answer is
// graded correct exactly when every pick is its own index; anything else (a wrong part count, a
// repeated or out-of-range index, the "self-correct" self-grades of older versions) reads as unchosen.
export function matchSelections(given: string, size: number): (number | undefined)[] {
  const parts = given.split(',')
  if (parts.length !== size) return Array.from({ length: size }, () => undefined)
  const taken = new Set<number>()
  return parts.map((part) => {
    const pick = Number(part)
    if (String(pick) !== part || pick < 0 || pick >= size || taken.has(pick)) return undefined
    taken.add(pick)
    return pick
  })
}

export function isCorrect(q: Question, given: string): boolean {
  if (q.type === 'match_pairs') {
    // `pairs` is the key: every left item sits with its own right-hand value, so the answer is "0,1,2,…".
    return !!q.pairs?.length && given === q.pairs.map((_, i) => i).join(',')
  }
  if (isSlotQuestion(q)) {
    const { hits, total } = slotScore(q, given)
    return total > 0 && hits === total
  }
  if (!q.correct) return false
  if (q.type === 'multi_select') {
    const a = new Set(given.split(',').map((x) => x.trim().toUpperCase()))
    const b = new Set((q.correct ?? '').split(',').map((x) => x.trim().toUpperCase()))
    if (a.size !== b.size) return false
    for (const v of a) if (!b.has(v)) return false
    return true
  }
  if (q.type === 'fill_blank') {
    return normalizeAnswer(given) === normalizeAnswer(q.correct)
  }
  if (q.type === 'drag_drop_order') {
    return normalizeAnswer(given) === normalizeAnswer(q.correct)
  }
  return given.trim().toUpperCase() === (q.correct || '').trim().toUpperCase()
}

// The share of one point an answer earns. Multi-part questions (code_fill, text_fill, answer_bank,
// yes_no_grid) earn per slot: 2 of 3 placeholders right is 2/3. Every other type, match pairs included,
// stays all or nothing. "Correct" (practice stats, the Missed filter) still means the full point.
export function answerCredit(q: Question, given?: string): number {
  if (!given) return 0
  if (isSlotQuestion(q)) {
    const { hits, total } = slotScore(q, given)
    return total ? hits / total : 0
  }
  return isCorrect(q, given) ? 1 : 0
}

export interface MockResult {
  question: FlatQuestion
  number: number // 1-based position in the mock, as it was shown
  given?: string
  correct: boolean
  credit: number // 0 to 1; below 1 while `correct` is false only for a partly right multi-part answer
  flagged: boolean
}

// Each question of a mock with its saved answer and grade, in the order the mock showed them. Ids no
// longer in the bank (case-study parents saved by older versions) are skipped, as the mock skips them.
export function gradeMock(run: MockExamRun): MockResult[] {
  const questions = run.questionIds.flatMap((id) => QUESTION_BY_ID.get(id) ?? [])
  return questions.map((question, i) => {
    const given = run.answers[question.id]
    return {
      question,
      number: i + 1,
      given,
      correct: !!given && isCorrect(question, given),
      credit: answerCredit(question, given),
      flagged: !!run.flagged?.[question.id],
    }
  })
}

// Out of 1000, as the exam reports it: each question is worth one point, multi-part questions earn part
// of it per slot, and unanswered questions earn nothing.
export function mockScore(results: MockResult[]): number {
  if (!results.length) return 0
  return Math.round((results.reduce((sum, r) => sum + r.credit, 0) / results.length) * 1000)
}

export function questionLetterOptions(q: Question): string[] {
  return q.options ?? []
}
