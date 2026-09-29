import type { CaseStudy } from '../types'
import RichText from './RichText'

// A case study's shared scenario: shown in full with the case's first question and once at the top of the
// case in a mock's review, and one select away on every other question. Each question under it is still
// answered and graded on its own.
export default function CaseStudyPanel({
  caseStudy,
  part,
  open = true,
}: {
  caseStudy: CaseStudy
  part?: { index: number; total: number }
  open?: boolean
}) {
  return (
    <details open={open} className="group rounded-xl border border-accent-2/40 bg-accent-2/5">
      <summary className="flex flex-wrap items-center gap-x-2 gap-y-1 p-3 cursor-pointer list-none rounded-xl transition-colors hover:bg-accent-2/10 [&::-webkit-details-marker]:hidden">
        <span aria-hidden className="text-ink-dim transition-transform group-open:rotate-90 motion-reduce:transition-none">
          ▸
        </span>
        <span className="chip chip-purple">Case study</span>{' '}
        <span className="font-display font-semibold text-ink">{caseStudy.title}</span>{' '}
        {part && (
          <span className="text-xs text-ink-mute">
            · Question {part.index + 1} of {part.total}
          </span>
        )}{' '}
        <span className="text-xs text-accent group-open:hidden">Show the scenario</span>
      </summary>
      <div className="@container px-4 pb-4 space-y-3 text-sm text-ink-dim leading-relaxed">
        <p>
          <RichText text={caseStudy.summary} />
        </p>
        <div className="grid gap-x-6 gap-y-3 @2xl:grid-cols-2">
          {caseStudy.sections.map((section) => (
            <div key={section.heading} className="min-w-0">
              <div className="text-xs uppercase tracking-wider text-ink-mute font-semibold mb-1">{section.heading}</div>
              <ul className="list-disc pl-5 space-y-1 marker:text-ink-mute">
                {section.items.map((item, i) => (
                  <li key={i} className="wrap-break-word">
                    <RichText text={item} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </details>
  )
}
