import type { CaseStudy, FlatQuestion } from '../types'
import { defineCaseStudy } from './define'

// The exam's case-study section: one shared scenario, then eight questions about it in mixed formats.
// It closes every mock, after the main questions, and each question is still graded and retried on its
// own. Original content, not copied from a real exam. Ids are stored in users' progress: never renumber.
// Multi-part answers are stored as indices into each slot's options or a bank's list: add choices at the
// end, never reorder or remove them, or saved answers would be graded against the wrong choice.

export const CASE_STUDY: CaseStudy = {
  id: 'case-northwind',
  title: 'Northwind Payments: the agent pipeline',
  summary:
    "Northwind's payments team uses Copilot cloud agent to implement issues, and a workflow of review agents on every pull request. A string of incidents last quarter prompted a review of the pipeline, its permissions and its controls. The incidents are numbered so the questions can refer to them.",
  sections: [
    {
      heading: 'Repository structure',
      items: [
        'Monorepo `northwind/payments`: `services/payments/` (API), `infra/` (Terraform), `docs/`.',
        '`.github/agents/`: `security-analyzer.agent.md`, `test-analyzer.agent.md`, `reviewer.agent.md`, `handoff-summarizer.agent.md`.',
        '`.github/workflows/`: `pr-agents.yml`, `handoff.yml`, `deploy.yml`.',
        '`.github/CODEOWNERS` has a single line: `* @northwind/devs`.',
      ],
    },
    {
      heading: 'Agents and responsibilities',
      items: [
        'Copilot cloud agent implements assigned issues on `copilot/*` branches and opens pull requests.',
        '`security-analyzer` (tools `read`, `search`) reports security findings, which its job saves as `security-report.json`.',
        '`test-analyzer` (tools `read`, `search`, `execute`) runs the test suite; its job saves the results as `test-report.json`.',
        '`reviewer` (tools `read`, `search`) reviews the diff; its job saves the verdict as `review.json`.',
        '`handoff-summarizer` writes the handoff report for the human reviewer. Its frontmatter has only `name` and `description`.',
      ],
    },
    {
      heading: 'Workflows and dependencies',
      items: [
        '`pr-agents.yml` runs on `pull_request` to `main`: jobs `security-scan` and `test-analysis`, then `review`, which needs both and has no `if`, then `summarize`.',
        'Each of the first three jobs uploads its report as an artifact: `security-report`, `test-report` and `review`.',
        '`summarize` currently declares `needs: review` and no `if`.',
        '`handoff.yml` runs when the label `ready-for-handoff` is added to a pull request. It downloads the most recent `review` artifact on the branch and re-posts the handoff summary.',
        '`deploy.yml` runs on push to `main` and on `workflow_dispatch`: `build`, then `deploy`, which needs `build`, runs the database migrations and then deploys. It has no concurrency setting.',
      ],
    },
    {
      heading: 'Permissions',
      items: [
        '`pr-agents.yml` sets `permissions: write-all` at the workflow level.',
        'The only write any `pr-agents.yml` job needs is the summary comment on the pull request.',
        '`deploy` gets cloud credentials through OIDC (`id-token: write`).',
      ],
    },
    {
      heading: 'Branches',
      items: ['`main` is protected by a ruleset. Copilot works on `copilot/*` branches, and people on feature branches.'],
    },
    {
      heading: 'GitHub controls',
      items: [
        'Ruleset on `main`: pull request required, 1 approving review, required status check `review`. Code Owner review is not required.',
        '`@northwind/devs` and `@northwind/platform` both have write access to the repository.',
        'The `production` environment lists `@northwind/payments-leads` as required reviewers, but `deploy` does not reference it yet.',
      ],
    },
    {
      heading: 'Artifacts and state',
      items: ['`review.json` records the verdict, but not which commit was reviewed.', 'Artifacts are kept for the default 90 days.'],
    },
    {
      heading: 'Current failures and risks',
      items: [
        '1. When `test-analysis` failed, `summarize` was skipped and no handoff report was posted.',
        '2. After a developer rebased a Copilot branch and force-pushed, `handoff.yml` posted "review passed" using a `review.json` produced for the previous head.',
        '3. Two merges 40 seconds apart started two deployments whose migrations ran at the same time.',
        "4. A Copilot pull request changed `deploy.yml` and merged with one app developer's approval; the platform team, `@northwind/platform`, never saw it.",
        '5. `test-analysis` sometimes times out reaching the package registry; the next attempt passes.',
        "6. The last deployment's migration truncated `payments.memo`, which broke order history.",
        '7. `reviewer` and Copilot disagree on whether dropping the `payments.legacy_ref` column is safe.',
      ],
    },
    {
      heading: 'Requirements',
      items: [
        'The two analyses run in parallel, and `review` waits for both.',
        "`summarize` reports every upstream job's result, even after a failure, but not when the run is cancelled.",
        'The summarizer is read-only, attributes each result to the agent that produced it, and reports missing inputs instead of guessing.',
        'Only the summary comment may write to the pull request; every other job token is read-only.',
        'Production deploys run only from `main`, never overlap, are never cancelled midway, and wait for a payments lead.',
        'The platform team approves every change to `.github/workflows/`.',
        'Transient failures recover without a person, harmful changes that shipped are undone, and judgment calls go to the payments leads with evidence.',
      ],
    },
  ],
}

export const CASE_STUDY_QUESTIONS: FlatQuestion[] = defineCaseStudy(CASE_STUDY, [
  {
    id: 'case-1',
    objective: '5.1',
    type: 'yes_no_grid',
    difficulty: 'medium',
    stem: 'Evaluate each statement about the pipeline as it is configured today.',
    slots: [
      {
        prompt: '`security-scan` and `test-analysis` can start at the same time.',
        answer: 'Yes',
        explanation: 'Neither needs the other, so both start as soon as runners are available.',
      },
      {
        prompt: '`review` can start while `test-analysis` is still running.',
        answer: 'No',
        explanation: '`review` needs both analyses, so it waits for every job it lists.',
      },
      {
        prompt: 'If `security-scan` fails, `review` is skipped.',
        answer: 'Yes',
        explanation: 'A job runs only if every job in its `needs` succeeded, unless its `if` says otherwise.',
      },
      {
        prompt: 'When `test-analysis` fails, `summarize` is skipped too, although it only lists `review`.',
        answer: 'Yes',
        explanation: '`review` is skipped, and a skipped dependency skips its dependents as well. That is incident 1.',
      },
      {
        prompt: 'In `deploy.yml`, the migrations can start before `build` has finished.',
        answer: 'No',
        explanation: 'The migrations run inside `deploy`, which needs `build`.',
      },
    ],
    explanation:
      'Read the `needs` graph as a dependency graph: jobs without `needs` start together, a job waits for everything it lists, and by default a failure skips everything downstream of it, directly or not.',
  },
  {
    id: 'case-2',
    objective: '5.3',
    type: 'code_fill',
    difficulty: 'hard',
    stem: 'Fix `summarize` in `pr-agents.yml` so that it meets the requirements.',
    template: `jobs:
  # security-scan, test-analysis and review as described
  summarize:
    runs-on: ubuntu-latest
    needs: [[1]]
    if: \${{ [[2]] }}
    permissions:
      contents: read
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
      - uses: [[3]]
        with:
          path: handoff
      - run: ./scripts/summarize.sh handoff`,
    slots: [
      {
        options: ['review', '[security-scan, test-analysis]', '[security-scan, test-analysis, review]', 'security-scan'],
        answer: '[security-scan, test-analysis, review]',
        explanation:
          "The summary reports every upstream job's result, and the `needs` context only holds jobs listed directly. `needs: review` would still wait for all three, but `needs.security-scan` and `needs.test-analysis` would be empty.",
      },
      {
        options: ['success()', '!cancelled()', 'always()', "needs.review.result == 'success'"],
        answer: '!cancelled()',
        explanation:
          '`!cancelled()` runs after success or failure but not after a cancellation. `success()` and the result check skip the job exactly when an upstream job fails (incident 1), and `always()` also runs on cancellation.',
      },
      {
        options: ['actions/upload-artifact@v4', 'actions/cache/restore@v4', 'actions/download-artifact@v4'],
        answer: 'actions/download-artifact@v4',
        explanation: 'The reports were uploaded by other jobs of the run. Without a `name`, the action downloads every artifact of the run into `handoff/`.',
      },
    ],
    explanation:
      'A summarizer is most needed when something failed, so its job must list every job it reports on, override the default `success()` condition, and fetch the reports those jobs left as artifacts.',
  },
  {
    id: 'case-3',
    objective: '5.1',
    type: 'code_fill',
    difficulty: 'hard',
    stem: 'Complete the `deploy` job in `deploy.yml` so that production deploys meet the requirements.',
    template: `on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: ./scripts/build.sh
  deploy:
    needs: build
    if: [[1]] == 'refs/heads/main'
    runs-on: ubuntu-latest
    environment: production
    concurrency:
      group: [[2]]
      cancel-in-progress: [[3]]
    permissions:
      contents: read
      id-token: write
    steps:
      - uses: actions/checkout@v4
      - run: ./scripts/migrate.sh
      - run: ./scripts/deploy.sh`,
    slots: [
      {
        options: ['github.ref_name', 'github.ref', 'github.head_ref'],
        answer: 'github.ref',
        explanation:
          '`workflow_dispatch` can be run from any branch, so the job checks the full ref, which reads `refs/heads/main`. `github.ref_name` is only `main`, and `github.head_ref` is empty outside pull requests.',
      },
      {
        options: ['${{ github.event_name }}', '${{ github.sha }}', 'production', '${{ github.run_id }}'],
        answer: 'production',
        explanation:
          'One fixed group covers every production deploy. Grouping by event name would let a manual deploy overlap one started by a push, and a SHA or run id gives each merge its own group, so two merges still overlap (incident 3).',
      },
      {
        options: ['true', 'false', "${{ github.event_name == 'push' }}"],
        answer: 'false',
        explanation:
          'Cancelling a deploy midway could leave migrations half applied, so a newer deploy waits instead. The expression would still cancel a running deploy whenever the newcomer came from a push.',
      },
    ],
    explanation:
      'Serialize everything that changes shared state with one concurrency group, never cancel it midway, and restrict where it may run from. The environment then adds the payments lead approval.',
  },
  {
    id: 'case-4',
    objective: '6.2',
    type: 'answer_bank',
    difficulty: 'medium',
    stem: 'Assign the control that meets each requirement. Some are already in place; not every control is used.',
    bank: [
      '`tools: ["read", "search"]` in `handoff-summarizer.agent.md`',
      'Workflow-level `permissions: contents: read`, and `contents: read` with `pull-requests: write` on `summarize` only',
      'The `deploy` job references the `production` environment',
      'Required status check `review` on `main`',
      'A rule in `.github/copilot-instructions.md`',
      '`disable-model-invocation: true` on `handoff-summarizer`',
      'Artifact retention settings',
      'A concurrency group on `pr-agents.yml`',
    ],
    slots: [
      {
        prompt: '`handoff-summarizer` can read the downloaded reports but cannot edit files or run commands',
        answer: '`tools: ["read", "search"]` in `handoff-summarizer.agent.md`',
        explanation:
          'Its profile has no `tools` line, which grants every tool. An explicit allow list of `read` and `search` removes edit and execute. Instructions only ask, and `disable-model-invocation` decides who may pick the agent, not what it can do.',
      },
      {
        prompt: 'Only the summary comment can write to the pull request; every other job token is read-only',
        answer: 'Workflow-level `permissions: contents: read`, and `contents: read` with `pull-requests: write` on `summarize` only',
        explanation:
          '`write-all` gives every job a write token. Read-only by default, with one job-level exception, is least privilege; a job-level block replaces the workflow-level one, so `summarize` lists `contents: read` again.',
      },
      {
        prompt: '`deploy` waits for a payments lead before it touches production',
        answer: 'The `deploy` job references the `production` environment',
        explanation: 'The environment already has the payments leads as required reviewers; it only applies to jobs that reference it.',
      },
      {
        prompt: 'A pull request cannot merge while `review` is failing or has not reported',
        answer: 'Required status check `review` on `main`',
        explanation:
          'Already in place: the ruleset waits for `review` to finish as success (or skipped or neutral) before allowing the merge. Note the gap this leaves: when an analysis fails, `review` is skipped, and a skipped required check does not block merging.',
      },
    ],
    explanation:
      'Each requirement maps to the layer that enforces it: agent tools, token permissions, environments and rulesets. Instructions, retention and a concurrency group do not enforce any of these.',
  },
  {
    id: 'case-5',
    objective: '3.2',
    type: 'multi_select',
    difficulty: 'hard',
    stem: 'Which TWO changes prevent a repeat of incident 2, where `handoff.yml` reported a verdict produced for an older head? (Select 2.)',
    options: [
      'A. Record the reviewed head SHA in `review.json`, and have `handoff.yml` compare it with `github.event.pull_request.head.sha` and report a mismatch as unresolved',
      'B. Give `handoff-summarizer` the `edit` tool so it can correct an outdated `review.json`',
      'C. Retire `handoff.yml`, and post the handoff only from `summarize`, which needs `review` in the same run, with `pr-agents.yml` cancelling superseded runs for the pull request',
      'D. Cache `review.json` with `actions/cache`, keyed on the branch name, so the latest verdict is always at hand',
      'E. Raise artifact retention, so older verdicts stay available for comparison',
    ],
    correct: 'A,C',
    explanation:
      'The verdict was valid for the old head and stale after the rebase. Either bind the verdict to the SHA it describes (A) or bind the summary to the run that reviewed the current head (C). Editing the verdict (B) invents state, a branch-keyed cache (D) preserves exactly the stale file, and retention (E) only keeps old artifacts longer.',
  },
  {
    id: 'case-6',
    objective: '6.2',
    type: 'multiple_choice',
    difficulty: 'hard',
    stem: "To stop incident 4 recurring, the team added `/.github/workflows/ @northwind/platform` to CODEOWNERS and enabled 'Require review from Code Owners' on `main`. A week later, another Copilot pull request that edits `deploy.yml` merged with one app developer's approval. What is the most likely cause?",
    options: [
      'A. Code Owner review does not apply to pull requests opened by Copilot',
      'B. The new line was added above the existing `*` line, so `*` still matches workflow files last and `@northwind/devs` remain their owners',
      "C. GitHub read CODEOWNERS from the pull request's own branch, where the agent had removed the new line",
      'D. Rulesets ignore CODEOWNERS entries for files under `.github/`',
    ],
    correct: 'B',
    explanation:
      "When several CODEOWNERS patterns match a file, the last one wins, so a specific rule has to come after the catch-all `*`; above it, every workflow file stays owned by `@northwind/devs`, and an app developer's approval satisfies the rule. Code Owner review applies to Copilot's pull requests like any other (A), GitHub uses the CODEOWNERS file on the base branch, so a pull request cannot remove its own owners (C), and `.github/` paths are owned like any other (D). The platform team also has write access, which a code owner needs.",
  },
  {
    id: 'case-7',
    objective: '2.4',
    type: 'answer_bank',
    difficulty: 'medium',
    stem: 'Assign the response that fits each incident. Not every response is used.',
    bank: [
      'Bounded retry',
      'Roll back: revert the change and redeploy the last good version',
      'Escalate to `@northwind/payments-leads` with the evidence',
      'Retry until it passes',
      'Disable the failing check',
      'Give the agent broader permissions',
      'Ignore it and continue',
    ],
    slots: [
      {
        prompt: 'Incident 5: `test-analysis` timed out reaching the package registry',
        answer: 'Bounded retry',
        explanation: 'A transient error may succeed on another attempt; the bound stops a real outage from looping forever.',
      },
      {
        prompt: 'Incident 6: the last migration truncated `payments.memo`',
        answer: 'Roll back: revert the change and redeploy the last good version',
        explanation: 'A harmful change that shipped is undone first (restoring the lost data from backup as well); retrying it would repeat the damage.',
      },
      {
        prompt: 'Incident 7: `reviewer` and Copilot disagree on dropping `payments.legacy_ref`',
        answer: 'Escalate to `@northwind/payments-leads` with the evidence',
        explanation: 'A judgment about irreversible data loss belongs to the owners, not to either agent.',
      },
    ],
    explanation:
      "Match the response to the failure: retries for transient errors, rollback for shipped harm, escalation for decisions outside the agents' authority. Unbounded retries, disabled checks and wider permissions hide problems instead of resolving them.",
  },
  {
    id: 'case-8',
    objective: '5.2',
    type: 'multiple_choice',
    difficulty: 'medium',
    stem: 'Six weeks after a pull request merged, an auditor asks what `security-analyzer` reported on it. Its last `pr-agents.yml` run was the day before the merge. Where is that record, and is it still available?',
    options: [
      'A. In `security-report.json` on `main`, because the job commits its report when the pull request merges',
      "B. In the pull request's Copilot session log, which records every agent's output",
      "C. In the `security-report` artifact of that pull request's `pr-agents.yml` run, which is kept for the default 90 days, so it is still there",
      "D. Nowhere: a run's artifacts are deleted once its pull request merges",
    ],
    correct: 'C',
    explanation:
      "The job saved the analyzer's output and uploaded it as the `security-report` artifact of that run, and artifacts stay with the run for the retention period whether or not the pull request merged (D). Nothing commits the report to `main` (A), and the Copilot session log records Copilot cloud agent's own work, not the review agents' Actions jobs (B). After 90 days the evidence is gone unless it is kept elsewhere, which is worth knowing when an audit trail matters.",
  },
])
