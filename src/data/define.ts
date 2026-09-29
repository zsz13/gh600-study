import dataRaw from '../data.json'
import type { CaseStudy, DataShape, FlatQuestion, Question } from '../types'

const DOMAINS = (dataRaw as unknown as DataShape).domains

// A question as written in a bank file: its stable id (stored in users' progress, so never renumber) and
// the objective it tests, such as '5.1'.
export type Draft = Omit<Question, 'domain'> & { id: string; objective: string }

// A bank entry from a draft. The domain and objective titles come from data.json, so they cannot drift
// from the titles the results pages group by.
export function defineQuestion({ id, objective, ...question }: Draft): FlatQuestion {
  const domainId = Number(objective.split('.')[0])
  const domain = DOMAINS.find((d) => d.domain_id === domainId)
  const found = domain?.objectives.find((o) => o.id === objective)
  if (!domain || !found) throw new Error(`${id}: unknown objective ${objective}`)
  return {
    ...question,
    id,
    domain: objective,
    domainId,
    domainTitle: domain.title,
    objectiveId: objective,
    objectiveTitle: found.title,
  }
}

// A case study's questions, each carrying the shared scenario and its place in the set. Each one is still
// graded, counted per domain and retried on its own.
export function defineCaseStudy(caseStudy: CaseStudy, drafts: Draft[]): FlatQuestion[] {
  return drafts.map((draft, index) => ({
    ...defineQuestion(draft),
    caseStudy,
    casePart: { index, total: drafts.length },
  }))
}
