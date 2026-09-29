import type { FlatQuestion } from '../types'
import { defineQuestion as q } from './define'

// Original applied questions in the exam's interaction formats: workflow code with placeholders,
// statements with placeholders, requirements filled from a shared answer bank, and Yes/No or True/False
// statement grids, plus choice questions on file locations, agent design, orchestration and the
// issue-to-pull-request flow. None is copied from a real exam; each tests a concept, not a recollection.
// Ids are stored in users' progress: never renumber them. Multi-part answers are stored as indices into
// each slot's options or a bank's list: add choices at the end, never reorder or remove them, or saved
// answers would be graded against the wrong choice.
export const APPLIED_QUESTIONS: FlatQuestion[] = [
  // ── Workflow code with placeholders ─────────────────────────────────────────────────────────────
  q({
    id: 'ap-wf-1',
    objective: '5.1',
    type: 'code_fill',
    difficulty: 'hard',
    stem: 'Two analyzer jobs each write a JSON report. The `merge` job must start only after both analyzers have finished, and it must read both report files. Complete the workflow.',
    template: `jobs:
  security-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: ./scripts/security-scan.sh > security-report.json
      - uses: actions/upload-artifact@v4
        with:
          name: security-report
          path: security-report.json
  test-analysis:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: ./scripts/test-analysis.sh > test-report.json
      - uses: [[1]]
        with:
          name: test-report
          path: test-report.json
  merge:
    runs-on: ubuntu-latest
    [[2]]: [security-scan, test-analysis]
    steps:
      - uses: [[3]]
        with:
          pattern: '*-report'
          merge-multiple: true
      - run: ./scripts/merge-reports.sh security-report.json test-report.json`,
    slots: [
      {
        options: ['actions/cache@v4', 'actions/upload-artifact@v4', 'actions/download-artifact@v4', 'actions/checkout@v4'],
        answer: 'actions/upload-artifact@v4',
        explanation:
          'The report must outlive the `test-analysis` runner, so the job uploads it as an artifact of the run. `actions/cache` restores dependencies between runs; it is not a hand-off channel for results.',
      },
      {
        options: ['concurrency', 'depends-on', 'needs', 'workflow_run'],
        answer: 'needs',
        explanation:
          '`needs` makes `merge` wait for both jobs. `depends-on` is not an Actions key, `concurrency` limits simultaneous runs without ordering jobs, and `workflow_run` is an event that starts a different workflow.',
      },
      {
        options: ['actions/download-artifact@v4', 'actions/upload-artifact@v4', 'actions/cache/restore@v4', 'actions/checkout@v4'],
        answer: 'actions/download-artifact@v4',
        explanation:
          '`merge` runs on a fresh runner, so the reports only exist there once it downloads them. `pattern` with `merge-multiple: true` puts both files in the workspace.',
      },
    ],
    explanation:
      'Jobs run in parallel on separate runners unless `needs` orders them, and nothing on disk carries over between jobs. A hand-off needs both halves: `needs` for the order, and an artifact upload and download for the data. `needs` alone leaves `merge` with no files; the download alone could run before the uploads exist.',
  }),
  q({
    id: 'ap-wf-2',
    objective: '6.2',
    type: 'code_fill',
    difficulty: 'medium',
    stem: 'In this repository, pull requests opened by the Copilot agent list `github-copilot[bot]` as their author. The `publish-preview` job must never run for those pull requests, even after a human pushes a commit to one. Complete the workflow.',
    template: `on:
  [[1]]:
    paths: ['site/**']

jobs:
  publish-preview:
    if: [[2]] != 'github-copilot[bot]'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: ./scripts/publish-preview.sh`,
    slots: [
      {
        options: ['push', 'pull_request', 'workflow_dispatch', 'issues'],
        answer: 'pull_request',
        explanation:
          'The author is part of the pull request payload. On `push` there is no `github.event.pull_request`, so the comparison would test an empty value and the job would run for every push, Copilot branches included.',
      },
      {
        options: ['github.actor', 'github.triggering_actor', 'github.event.pull_request.user.login', 'github.repository_owner'],
        answer: 'github.event.pull_request.user.login',
        explanation:
          '`github.event.pull_request.user.login` is the account that opened the pull request, the same for every run. A human pushing to the Copilot branch becomes `github.actor` and `github.triggering_actor` for that run, which would let the job through.',
      },
    ],
    explanation:
      'Guard on the property that does not change: who authored the pull request. The actor contexts describe one run: a teammate pushing a fix changes both of them, and a re-run changes `github.triggering_actor`. The bot login is this scenario\'s; before hard-coding one, check what your own Copilot pull requests report (on GitHub.com the payload shows the author as `login: "Copilot"`, `type: "Bot"`, from the `copilot-swe-agent` app).',
  }),
  q({
    id: 'ap-wf-3',
    objective: '6.2',
    type: 'code_fill',
    difficulty: 'medium',
    stem: 'Deploying to production must pause until a release manager approves it in GitHub, and it may only run from `main`. The `production` environment already lists the release managers as required reviewers. Complete the job.',
    template: `jobs:
  deploy:
    if: [[1]] == 'refs/heads/main'
    runs-on: ubuntu-latest
    [[2]]: production
    permissions:
      contents: read
      id-token: write
    steps:
      - uses: actions/checkout@v4
      - run: ./scripts/deploy.sh`,
    slots: [
      {
        options: ['github.ref_name', 'github.head_ref', 'github.ref', 'github.base_ref'],
        answer: 'github.ref',
        explanation:
          '`github.ref` is the full ref, such as `refs/heads/main`. `github.ref_name` is the short name (`main`), so this comparison would never match, and `github.head_ref` and `github.base_ref` are only set for pull request events.',
      },
      {
        options: ['environment', 'concurrency', 'needs', 'services'],
        answer: 'environment',
        explanation:
          "A job that references an environment is held until that environment's protection rules pass; with required reviewers it waits for an approval. `concurrency` and `needs` order work but never ask a person.",
      },
    ],
    explanation:
      'Approval gates belong to environments: the workflow only names the environment, and GitHub enforces its required reviewers before the job starts. The `if` keeps the job from running for other refs at all.',
  }),
  q({
    id: 'ap-wf-4',
    objective: '5.1',
    type: 'code_fill',
    difficulty: 'medium',
    stem: 'A review-agent workflow runs on every push to a pull request. When a new commit arrives, the run for the previous commit of that same pull request should be cancelled. Runs for other pull requests, and runs of other workflows, must not be affected. Complete the workflow.',
    template: `name: agent-review
on:
  pull_request:

[[1]]:
  group: \${{ github.workflow }}-[[2]]
  cancel-in-progress: [[3]]

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: ./scripts/review.sh`,
    slots: [
      {
        options: ['needs', 'concurrency', 'strategy', 'environment'],
        answer: 'concurrency',
        explanation: 'A top-level `concurrency` block puts every run of this workflow into the group it names; only one run per group is in progress at a time.',
      },
      {
        options: ['${{ github.sha }}', '${{ github.run_id }}', '${{ github.actor }}', '${{ github.ref }}'],
        answer: '${{ github.ref }}',
        explanation:
          'On `pull_request`, `github.ref` is `refs/pull/<number>/merge`: one value per pull request. The SHA changes with every commit and the run id with every run, so neither would ever group two runs; the actor would group different pull requests opened by the same person.',
      },
      {
        options: ['false', 'true'],
        answer: 'true',
        explanation: '`true` cancels the older run that is still in progress. With `false` the new run would wait for it instead.',
      },
    ],
    explanation:
      'The group decides which runs compete; `cancel-in-progress` decides whether the newcomer waits or replaces the running one. Prefixing the workflow name keeps other workflows on the same pull request out of this group.',
  }),
  q({
    id: 'ap-wf-5',
    objective: '5.3',
    type: 'code_fill',
    difficulty: 'hard',
    stem: "The `summarize` job must wait for `plan`, `implement` and `review`. It must still run when any of them fails, so it can report the failure, but not when the run is cancelled. It also passes the review job's final status to its script. Complete the job.",
    template: `jobs:
  # plan, implement and review are defined above
  summarize:
    runs-on: ubuntu-latest
    needs: [plan, implement, review]
    if: \${{ [[1]] }}
    steps:
      - uses: actions/download-artifact@v4
        with:
          path: upstream
      - run: ./scripts/summarize.sh upstream "\${{ [[2]] }}"`,
    slots: [
      {
        options: ['always()', 'success()', '!cancelled()', 'failure()'],
        answer: '!cancelled()',
        explanation:
          '`!cancelled()` runs after success or failure but not after a cancellation. `always()` would run on cancellation too, `success()` is the default that skips the job after a failure, and `failure()` would skip it when everything passed.',
      },
      {
        options: ['steps.review.outcome', 'needs.review.result', 'jobs.review.result', 'github.job'],
        answer: 'needs.review.result',
        explanation:
          "`needs.<job>.result` is `success`, `failure`, `cancelled` or `skipped` for each job listed in `needs`. `steps` only holds the current job's steps, and the `jobs` context exists only for a reusable workflow's outputs.",
      },
    ],
    explanation:
      'By default a job whose dependency failed is skipped, which is exactly when a summary matters most. A status function in `if` overrides that, and the `needs` context tells the job how each upstream job ended, so the summary can say so instead of guessing. (Written as `${{ }}` because an `if` that starts with `!` would otherwise be read as a YAML tag.)',
  }),
  q({
    id: 'ap-wf-6',
    objective: '5.2',
    type: 'code_fill',
    difficulty: 'medium',
    stem: 'The `analyze` job must keep its `findings.sarif` file for later jobs and for reviewers, even when the analyzer step fails. Complete the last step.',
    template: `jobs:
  analyze:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run analyzer
        run: ./scripts/analyze.sh --out findings.sarif
      - name: Keep findings
        if: [[1]]
        uses: [[2]]
        with:
          name: findings
          path: findings.sarif
          retention-days: 14`,
    slots: [
      {
        options: ['success()', "github.event_name == 'push'", 'always()', "steps.analyze.outcome == 'success'"],
        answer: 'always()',
        explanation:
          "Once a step fails, later steps are skipped unless their condition says otherwise; `always()` keeps the upload so partial findings survive. `success()` is the default, and the other two conditions have no status function, so `success()` is implied and they are skipped after the failure too (no step even has the id `analyze`).",
      },
      {
        options: ['actions/download-artifact@v4', 'actions/upload-artifact@v4', 'actions/cache/save@v4', 'actions/checkout@v4'],
        answer: 'actions/upload-artifact@v4',
        explanation: '`name`, `path` and `retention-days` are inputs of `actions/upload-artifact`, which stores the file with the run, where later jobs and people can fetch it.',
      },
    ],
    explanation:
      "Evidence matters most when something failed. Uploading with `always()` makes the analyzer's output part of the run's record, and `retention-days` bounds how long it is kept.",
  }),
  q({
    id: 'ap-wf-7',
    objective: '2.4',
    type: 'code_fill',
    difficulty: 'medium',
    stem: 'A review-agent job checks out the repository and posts a single review comment on the pull request. It needs nothing else. Complete its permissions with least privilege.',
    template: `jobs:
  agent-review:
    runs-on: ubuntu-latest
    permissions:
      contents: [[1]]
      pull-requests: [[2]]
    steps:
      - uses: actions/checkout@v4
      - run: ./scripts/agent-review.sh
        env:
          GH_TOKEN: \${{ secrets.GITHUB_TOKEN }}`,
    slots: [
      {
        options: ['write', 'read', 'none'],
        answer: 'read',
        explanation: 'Checking out code only reads repository contents; `write` would also let the token push commits.',
      },
      {
        options: ['none', 'read', 'write'],
        answer: 'write',
        explanation: 'Posting a review comment writes to the pull request, which needs `pull-requests: write`; `read` can only fetch.',
      },
    ],
    explanation:
      'Once a job sets `permissions`, every scope it does not list drops to `none`, so this token can read code and comment on pull requests and nothing more. The minimum per job limits what a misbehaving agent, or anyone who hijacks it, can do with the token.',
  }),
  q({
    id: 'ap-wf-8',
    objective: '6.2',
    type: 'code_fill',
    difficulty: 'hard',
    stem: 'A `ready-to-merge` label may only be added when a human, not a bot account, approves a pull request. Complete the trigger and the condition.',
    template: `on:
  [[1]]:
    types: [submitted]

jobs:
  label:
    if: github.event.review.state == 'approved' && [[2]] != 'Bot'
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write
    steps:
      - run: gh pr edit "$PR" --add-label ready-to-merge --repo "$REPO"
        env:
          GH_TOKEN: \${{ secrets.GITHUB_TOKEN }}
          PR: \${{ github.event.pull_request.number }}
          REPO: \${{ github.repository }}`,
    slots: [
      {
        options: ['pull_request', 'pull_request_review_comment', 'pull_request_review', 'workflow_run'],
        answer: 'pull_request_review',
        explanation:
          'A submitted review, with its state and its author, arrives in the `pull_request_review` event. `pull_request` has no `submitted` activity, and `pull_request_review_comment` fires for individual comments on the diff.',
      },
      {
        options: ['github.event.pull_request.user.type', 'github.actor', 'github.event.review.user.type', 'github.event.sender.login'],
        answer: 'github.event.review.user.type',
        explanation:
          "The reviewer is `github.event.review.user`, and its `type` is `Bot` for bot accounts. `pull_request.user` is the pull request's author, not the reviewer, and a login is never the string `Bot`.",
      },
    ],
    explanation:
      'Decide on the reviewer, not on who opened the pull request or who triggered the run. The account `type` separates bots from people without a list of bot names to maintain. For the merge itself, rely on rulesets; a label workflow like this one is only a signal.',
  }),
  q({
    id: 'ap-wf-9',
    objective: '5.1',
    type: 'code_fill',
    difficulty: 'easy',
    stem: 'One workflow is triggered by both `push` (to `main`) and `pull_request`. The `agent-summary` job must run only for pull requests, and `publish-docs` only for pushes to `main`. Complete the conditions.',
    template: `on:
  push:
    branches: [main]
  pull_request:

jobs:
  agent-summary:
    if: [[1]] == 'pull_request'
    runs-on: ubuntu-latest
    steps:
      - run: ./scripts/agent-summary.sh
  publish-docs:
    if: github.event_name == 'push' && [[2]] == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - run: ./scripts/publish-docs.sh`,
    slots: [
      {
        options: ['github.event.action', 'github.workflow', 'github.event_name', 'github.job'],
        answer: 'github.event_name',
        explanation:
          '`github.event_name` is the event that started the run: `push` or `pull_request` here. `github.event.action` is the activity type (such as `opened`), not the event.',
      },
      {
        options: ['github.ref', 'github.ref_name', 'github.head_ref', 'github.base_ref'],
        answer: 'github.ref',
        explanation: 'Only the full ref reads `refs/heads/main`; `github.ref_name` would be `main`. `head_ref` and `base_ref` are empty on a push.',
      },
    ],
    explanation:
      'One workflow can serve several events and route each job with `if`. Checking the full ref as well as the event keeps `publish-docs` safe even if someone later widens the `push` trigger to more branches.',
  }),
  q({
    id: 'ap-wf-10',
    objective: '5.1',
    type: 'code_fill',
    difficulty: 'medium',
    stem: 'Deployments to production must never overlap, and a deployment that has started must never be cancelled halfway. The `test` job must still run for every push. Complete the `deploy` job.',
    template: `on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm test
  deploy:
    needs: test
    runs-on: ubuntu-latest
    environment: production
    concurrency:
      group: [[1]]
      cancel-in-progress: [[2]]
    steps:
      - uses: actions/checkout@v4
      - run: ./scripts/deploy.sh`,
    slots: [
      {
        options: ['${{ github.sha }}', 'production-deploy', '${{ github.run_id }}', '${{ github.actor }}'],
        answer: 'production-deploy',
        explanation:
          'A fixed name puts every deployment in one group, so only one can be in progress. A SHA or run id differs for each run, and the actor only groups deployments started by the same person.',
      },
      {
        options: ['true', 'false'],
        answer: 'false',
        explanation:
          '`false` makes a newer deployment wait instead of killing one that may be halfway through a migration. While it waits, a still newer run replaces it: by default (`queue: single`) a group keeps at most one pending run.',
      },
    ],
    explanation:
      'Job-level concurrency serializes only the job that declares it, so tests keep running for every push while deployments go one at a time. Serializing without cancelling is the usual choice for anything that changes shared state.',
  }),
  q({
    id: 'ap-wf-11',
    objective: '5.2',
    type: 'code_fill',
    difficulty: 'hard',
    stem: 'The `summarize` workflow must start when the `analyzers` workflow completes, and it must read the `analysis-report` artifact that the completed run produced. Complete the workflow.',
    template: `name: summarize
on:
  [[1]]:
    workflows: [analyzers]
    types: [completed]

jobs:
  summarize:
    runs-on: ubuntu-latest
    permissions:
      actions: read
      contents: read
    steps:
      - uses: actions/download-artifact@v4
        with:
          name: analysis-report
          run-id: \${{ [[2]] }}
          github-token: \${{ secrets.GITHUB_TOKEN }}
      - run: ./scripts/summarize.sh`,
    slots: [
      {
        options: ['workflow_call', 'workflow_dispatch', 'workflow_run', 'repository_dispatch'],
        answer: 'workflow_run',
        explanation:
          '`workflow_run` starts this workflow when a named workflow is requested or completes. `workflow_call` makes a workflow reusable by others, and the two dispatch events need an explicit trigger.',
      },
      {
        options: ['github.run_id', 'github.event.workflow_run.id', 'github.run_number', 'github.event.workflow_run.run_number'],
        answer: 'github.event.workflow_run.id',
        explanation:
          "The artifact belongs to the analyzers run, whose id arrives in the event payload. `github.run_id` is this summarize run, which has no such artifact, and run numbers are not run ids.",
      },
    ],
    explanation:
      "Artifacts belong to the run that uploaded them. Within one run, `needs` plus `actions/download-artifact` is enough; across runs the download needs the other run's id, a token, and `actions: read`.",
  }),

  // ── Shared answer bank ──────────────────────────────────────────────────────────────────────────
  q({
    id: 'ap-bank-1',
    objective: '5.1',
    type: 'answer_bank',
    difficulty: 'medium',
    stem: 'Three analyzer agents review a pull request in parallel jobs, and a merge job combines their reports. Assign the Actions feature that meets each requirement. Not every feature is used.',
    bank: [
      '`actions/upload-artifact@v4`',
      '`actions/download-artifact@v4`',
      '`needs`',
      '`concurrency`',
      '`strategy.matrix`',
      '`workflow_run`',
      '`CODEOWNERS`',
      '`environment`',
    ],
    slots: [
      {
        prompt: "Keep each analyzer's report after its job ends, so later jobs in the run can use it",
        answer: '`actions/upload-artifact@v4`',
        explanation: 'Uploading stores the file with the workflow run; the runner that produced it is discarded when its job ends.',
      },
      {
        prompt: "Get the three reports into the merge job's workspace",
        answer: '`actions/download-artifact@v4`',
        explanation: 'Every job starts on a clean runner, so the merge job downloads the artifacts it needs.',
      },
      {
        prompt: 'Start the merge job only after all three analyzers have finished',
        answer: '`needs`',
        explanation: '`needs: [a, b, c]` orders the jobs, and by default skips the merge if any analyzer fails.',
      },
      {
        prompt: 'Stop two runs of this workflow for the same pull request from overlapping',
        answer: '`concurrency`',
        explanation: 'A concurrency group allows one run per group in progress. `needs` orders jobs inside one run, not runs against each other.',
      },
    ],
    explanation:
      'Artifacts move data between jobs, `needs` orders jobs within a run, and `concurrency` governs runs against each other. `strategy.matrix` fans one job out over inputs, `workflow_run` chains separate workflows, and CODEOWNERS and environments are review and approval controls.',
  }),
  q({
    id: 'ap-bank-2',
    objective: '6.2',
    type: 'answer_bank',
    difficulty: 'medium',
    stem: 'Assign the control that enforces each governance requirement in a repository where agents open pull requests and run workflows. Not every control is used.',
    bank: [
      '`CODEOWNERS`',
      'Required status checks',
      'Environment',
      'Branch protection or ruleset',
      '`preToolUse` hook',
      'Workflow `permissions`',
      'Workflow artifact',
      'Pull request review',
    ],
    slots: [
      {
        prompt: 'Make the platform team the owners of `.github/workflows/**`, so their review is requested automatically',
        answer: '`CODEOWNERS`',
        explanation: 'CODEOWNERS maps paths to owners and requests their review. Making that review mandatory is a separate ruleset setting.',
      },
      {
        prompt: 'Hold a production deployment job until a named approver allows it',
        answer: 'Environment',
        explanation: 'Required reviewers on an environment pause every job that references it until someone approves.',
      },
      {
        prompt: 'Stop an agent from running a destructive shell command before it executes',
        answer: '`preToolUse` hook',
        explanation: 'A `preToolUse` hook runs before the tool call and can deny it; the other controls never see individual commands.',
      },
      {
        prompt: "Let an analysis job's `GITHUB_TOKEN` read the repository but not push to it",
        answer: 'Workflow `permissions`',
        explanation: '`permissions: contents: read` scopes the token that the job receives.',
      },
    ],
    explanation:
      'Each control acts at a different point: ownership decides who is asked, environments decide whether a deployment may start, hooks decide whether a single tool call may run, and permissions decide what a token can do. Required checks, rulesets and reviews gate merging, which none of these requirements is about.',
  }),
  q({
    id: 'ap-bank-3',
    objective: '1.3',
    type: 'answer_bank',
    difficulty: 'medium',
    stem: 'A workflow logs context values so that agent runs can be traced. Assign the context that answers each question. Not every context is used.',
    bank: [
      '`github.actor`',
      '`github.ref`',
      '`github.event_name`',
      '`github.event.pull_request.user.login`',
      '`github.repository`',
      '`github.sha`',
      '`github.workflow`',
      '`github.job`',
    ],
    slots: [
      {
        prompt: 'Who triggered this run?',
        answer: '`github.actor`',
        explanation: '`github.actor` is the account whose action started the run: the pusher, the person who merged, or a bot.',
      },
      {
        prompt: 'Which branch or tag ref is being processed, such as `refs/heads/main`?',
        answer: '`github.ref`',
        explanation: '`github.ref` is the full ref that triggered the run.',
      },
      {
        prompt: 'Did the run start from `pull_request` or from `push`?',
        answer: '`github.event_name`',
        explanation: '`github.event_name` names the event that started the run.',
      },
      {
        prompt: 'Who opened the pull request, even if someone else pushed its latest commit?',
        answer: '`github.event.pull_request.user.login`',
        explanation: "The pull request payload keeps its author for every run, while the actor changes with each push.",
      },
    ],
    explanation:
      'Actor, ref and event describe this run; the pull request author describes the pull request. `github.sha` is a commit, `github.repository` the owner and name, and `github.workflow` and `github.job` name what is running.',
  }),
  q({
    id: 'ap-bank-4',
    objective: '2.3',
    type: 'answer_bank',
    difficulty: 'medium',
    stem: 'You are adding agent configuration to a repository. Assign the location where each item belongs. Not every location is used.',
    bank: [
      '`.github/agents/`',
      '`.github/copilot-instructions.md`',
      '`.github/workflows/`',
      '`.github/CODEOWNERS`',
      '`.github/hooks/`',
      '`.vscode/mcp.json`',
      '`.github/copilot/agents/`',
      '`.github/workflows/agents/`',
    ],
    slots: [
      {
        prompt: 'A new custom agent profile, `release-notes.agent.md`',
        answer: '`.github/agents/`',
        explanation: 'Repository custom agents are profiles in `.github/agents/`, conventionally named `<name>.agent.md`.',
      },
      {
        prompt: 'Guidance that every Copilot request in the repository should follow',
        answer: '`.github/copilot-instructions.md`',
        explanation: 'This is the repository-wide custom instructions file.',
      },
      {
        prompt: 'The Actions pipeline that runs the analyzer agents on each pull request',
        answer: '`.github/workflows/`',
        explanation: 'Actions only reads workflow files placed directly in `.github/workflows/`; subdirectories are not loaded.',
      },
      {
        prompt: 'Who must be asked to review changes to `infra/**`',
        answer: '`.github/CODEOWNERS`',
        explanation: 'CODEOWNERS (in `.github/`, the root or `docs/`) maps paths to the owners whose review is requested.',
      },
    ],
    explanation:
      'Agent profiles, instructions, workflows and ownership each have one conventional home, and GitHub only looks there. `.github/copilot/agents/` and `.github/workflows/agents/` are not locations GitHub reads; `.github/hooks/` holds hooks, and `.vscode/mcp.json` configures MCP servers for VS Code.',
  }),
  q({
    id: 'ap-bank-5',
    objective: '5.1',
    type: 'answer_bank',
    difficulty: 'medium',
    stem: 'Assign the Actions feature that meets each orchestration requirement. Not every feature is used.',
    bank: [
      '`needs`',
      '`concurrency`',
      '`strategy.matrix`',
      '`workflow_run`',
      '`workflow_dispatch`',
      '`environment`',
      'Job `outputs`',
      '`continue-on-error`',
    ],
    slots: [
      {
        prompt: 'Run the same test agent on Node 20 and Node 22 at the same time',
        answer: '`strategy.matrix`',
        explanation: 'A matrix creates one job per combination of values, and they run in parallel.',
      },
      {
        prompt: 'Start the summarizer workflow whenever the analyzers workflow completes',
        answer: '`workflow_run`',
        explanation: '`workflow_run` triggers a workflow when another named workflow is requested or completes.',
      },
      {
        prompt: 'Expose a short verdict string from the review job to the jobs that depend on it',
        answer: 'Job `outputs`',
        explanation: 'A job maps step outputs to its `outputs`; dependents read them as `needs.<job>.outputs.<name>`.',
      },
      {
        prompt: 'Let a maintainer start the workflow by hand from the Actions tab',
        answer: '`workflow_dispatch`',
        explanation: '`workflow_dispatch` adds a manual "Run workflow" trigger.',
      },
    ],
    explanation:
      'Triggers (`workflow_run`, `workflow_dispatch`) decide when a workflow starts, `strategy.matrix` decides how many copies of a job run, and `outputs` carry small values downstream. `needs` and `concurrency` order jobs and runs, `environment` gates deployments, and `continue-on-error` lets a job fail without failing the run.',
  }),
  q({
    id: 'ap-bank-6',
    objective: '4.2',
    type: 'answer_bank',
    difficulty: 'hard',
    stem: 'Each incident below was traced to a missing control. Assign the control that would have prevented it. Not every control is used.',
    bank: [
      'Required status check',
      'CODEOWNERS plus required Code Owner review',
      'Environment required reviewers',
      '`preToolUse` hook',
      '`permissions: contents: read`',
      'Concurrency group',
      'Longer artifact retention',
      '`copilot-setup-steps.yml`',
    ],
    slots: [
      {
        prompt: 'A pull request merged while its `test` job was failing',
        answer: 'Required status check',
        explanation: 'A required check must pass before the ruleset allows a merge; an ordinary check only reports.',
      },
      {
        prompt: "A job's `GITHUB_TOKEN` pushed a commit, although the job only needed to read code",
        answer: '`permissions: contents: read`',
        explanation: 'Scoping the token to read makes the push impossible, whatever the job runs.',
      },
      {
        prompt: 'Two production deployments ran at the same time and interleaved their database migrations',
        answer: 'Concurrency group',
        explanation: 'Approvals decide whether each deployment may start, not whether two approved ones overlap; a shared concurrency group serializes them.',
      },
      {
        prompt: 'A change to `.github/workflows/deploy.yml` merged without the platform team seeing it',
        answer: 'CODEOWNERS plus required Code Owner review',
        explanation: 'Ownership requests the platform team; the required review makes their approval a condition of merging.',
      },
    ],
    explanation:
      'Root-cause analysis ends with the control that closes the gap. A `preToolUse` hook governs agent tool calls, retention keeps evidence longer, and `copilot-setup-steps.yml` prepares the agent environment; none of them would have stopped these incidents.',
  }),
  q({
    id: 'ap-bank-7',
    objective: '5.2',
    type: 'answer_bank',
    difficulty: 'medium',
    stem: 'A summarizer agent turns the outputs of upstream agents into a handoff report. Assign the report section where each finding belongs. Not every section is used.',
    bank: [
      'Upstream agent results',
      'Evidence',
      'Risks',
      'Unresolved items',
      'Recommended next owner',
      'Code changes applied',
      'Merge decision',
      'Deployment log',
    ],
    slots: [
      {
        prompt: '"Planner: plan approved. Coder: 3 files changed. Reviewer: 1 blocking comment."',
        answer: 'Upstream agent results',
        explanation: 'Each result is attributed to the agent that produced it.',
      },
      {
        prompt: 'Links to the `test-report` artifact and to the failing check run',
        answer: 'Evidence',
        explanation: 'Evidence links let a reader verify every claim in the summary.',
      },
      {
        prompt: 'If the new flag defaults to on, existing users may lose saved drafts',
        answer: 'Risks',
        explanation: 'A possible consequence of the change, not a disagreement or a gap in the inputs.',
      },
      {
        prompt: 'The reviewer and the coder disagree on whether the cache key change is required',
        answer: 'Unresolved items',
        explanation: 'A conflict between upstream agents is reported with both positions and left for a person; the summarizer does not pick a winner.',
      },
    ],
    explanation:
      'A summarizer reports; it does not act. Sections such as "Code changes applied", "Merge decision" or "Deployment log" would mean the summarizer changed code, merged or deployed, which is outside its read-only role.',
  }),
  q({
    id: 'ap-bank-8',
    objective: '1.3',
    type: 'answer_bank',
    difficulty: 'easy',
    stem: 'Copilot is working on an issue you assigned to it. Assign where you would look for each piece of information. Not every place is used.',
    bank: [
      'The issue',
      'The pull request (Conversation and Files changed)',
      'The Copilot session log',
      'Repository Insights',
      'Actions secrets',
      'Branch protection settings',
    ],
    slots: [
      {
        prompt: 'The acceptance criteria the agent was asked to meet',
        answer: 'The issue',
        explanation: 'The issue is the task definition that Copilot received.',
      },
      {
        prompt: 'Which files the agent changed, and the review discussion about them',
        answer: 'The pull request (Conversation and Files changed)',
        explanation: 'The pull request carries the implementation: its diff, commits, checks and review.',
      },
      {
        prompt: 'The steps the agent took and the commands it ran along the way',
        answer: 'The Copilot session log',
        explanation: "The session log records the agent's reasoning steps and tool calls.",
      },
    ],
    explanation:
      'The issue holds the requirements, the pull request holds the implementation state, and the session log shows how the agent got there. Insights, secrets and branch settings describe the repository, not this task.',
  }),

  // ── Statements with placeholders ────────────────────────────────────────────────────────────────
  q({
    id: 'ap-text-1',
    objective: '5.1',
    type: 'text_fill',
    difficulty: 'medium',
    stem: 'Complete the statement about preventing overlapping runs.',
    template:
      'To stop two runs of an entire multi-job workflow from overlapping on the same branch, without affecting other workflows on that branch, configure [[1]] at the [[2]] level and build its group from [[3]].',
    slots: [
      {
        options: ['`needs`', '`concurrency`', '`strategy.matrix`', '`environment`'],
        answer: '`concurrency`',
        explanation: 'Only `concurrency` relates runs to each other; `needs` orders jobs within one run.',
      },
      {
        options: ['step', 'job', 'workflow'],
        answer: 'workflow',
        explanation: 'Job-level concurrency serializes only that job, so the other jobs of the two runs could still overlap.',
      },
      {
        options: ['`${{ github.ref }}`', '`${{ github.workflow }}-${{ github.ref }}`', '`${{ github.run_id }}`', '`${{ github.sha }}`'],
        answer: '`${{ github.workflow }}-${{ github.ref }}`',
        explanation:
          'Group names are shared by every workflow in the repository, so the ref alone would make other workflows on the branch compete too. A run id or a SHA is unique per run or commit and would never group anything.',
      },
    ],
    explanation: 'The level decides what is serialized; the group decides which runs compete with each other.',
  }),
  q({
    id: 'ap-text-2',
    objective: '5.1',
    type: 'text_fill',
    difficulty: 'easy',
    stem: 'Complete the statement contrasting three orchestration features.',
    template:
      '[[1]] makes a job wait until other jobs in the same run finish, [[2]] makes a new run wait for or cancel another run in the same group, and [[3]] runs one job several times with different inputs.',
    slots: [
      {
        options: ['`concurrency`', '`needs`', '`strategy.matrix`', '`workflow_run`'],
        answer: '`needs`',
        explanation: '`needs` builds the dependency graph between jobs of a run.',
      },
      {
        options: ['`needs`', '`strategy.matrix`', '`workflow_run`', '`concurrency`'],
        answer: '`concurrency`',
        explanation: '`concurrency` groups runs (or jobs) so that only one per group is in progress.',
      },
      {
        options: ['`workflow_run`', '`concurrency`', '`strategy.matrix`', '`needs`'],
        answer: '`strategy.matrix`',
        explanation: 'A matrix expands one job into one job per combination of values.',
      },
    ],
    explanation:
      'The three are often confused because each changes when work happens. Only `needs` expresses dependency, only `concurrency` expresses mutual exclusion, and only a matrix multiplies a job. `workflow_run` starts a separate workflow.',
  }),
  q({
    id: 'ap-text-3',
    objective: '6.2',
    type: 'text_fill',
    difficulty: 'medium',
    stem: 'Complete the statement about code ownership.',
    template:
      "A `CODEOWNERS` entry on its own only [[1]] the owners' review. To block merging until an owner approves, enable [[2]] in a branch ruleset or branch protection rule for the target branch.",
    slots: [
      {
        options: ['requires', 'requests', 'replaces', 'bypasses'],
        answer: 'requests',
        explanation: 'Owners are added as requested reviewers automatically, but nothing waits for them.',
      },
      {
        options: ['Require status checks to pass', 'Require linear history', 'Require review from Code Owners', 'Require signed commits'],
        answer: 'Require review from Code Owners',
        explanation: 'This rule makes an owner\'s approval a merge condition for the paths they own.',
      },
    ],
    explanation: 'Ownership and enforcement are separate: CODEOWNERS says who, the ruleset says it is mandatory.',
  }),
  q({
    id: 'ap-text-4',
    objective: '6.2',
    type: 'text_fill',
    difficulty: 'medium',
    stem: 'Complete the statement contrasting two controls on a deployment job.',
    template:
      'On a job, `permissions: contents: read` limits [[1]]. Adding `environment: production`, where the environment has required reviewers, controls [[2]].',
    slots: [
      {
        options: ["what the job's `GITHUB_TOKEN` may do", 'whether the job may start before a person approves it', 'which people may trigger the workflow'],
        answer: "what the job's `GITHUB_TOKEN` may do",
        explanation: 'Permissions scope the token issued to the job.',
      },
      {
        options: ['which people may trigger the workflow', "what the job's `GITHUB_TOKEN` may do", 'whether the job may start before a person approves it'],
        answer: 'whether the job may start before a person approves it',
        explanation: 'Required reviewers hold the job until someone approves the deployment.',
      },
    ],
    explanation:
      'Least privilege and human approval are complementary: one limits what an approved job can do, the other decides whether it runs at all. Neither decides who can trigger the workflow.',
  }),
  q({
    id: 'ap-text-5',
    objective: '5.2',
    type: 'text_fill',
    difficulty: 'easy',
    stem: 'Complete the statement about handing a file from one job to another.',
    template:
      'A job that writes `plan.md` must use [[1]] so the file outlives its runner. A later job in the same run lists that job under [[2]] and then uses [[3]] to get the file.',
    slots: [
      {
        options: ['`actions/download-artifact`', '`actions/upload-artifact`', '`actions/cache`', '`$GITHUB_OUTPUT`'],
        answer: '`actions/upload-artifact`',
        explanation: '`$GITHUB_OUTPUT` carries short string outputs, not files, and the cache is for dependencies across runs.',
      },
      {
        options: ['`concurrency`', '`outputs`', '`needs`', '`environment`'],
        answer: '`needs`',
        explanation: 'Without `needs`, the later job could start before the upload exists.',
      },
      {
        options: ['`actions/upload-artifact`', '`actions/checkout`', '`actions/download-artifact`', '`actions/cache`'],
        answer: '`actions/download-artifact`',
        explanation: 'The download puts the artifact into the later job\'s workspace.',
      },
    ],
    explanation: 'Artifacts are the durable hand-off between jobs and a record of what each agent produced.',
  }),
  q({
    id: 'ap-text-6',
    objective: '1.1',
    type: 'text_fill',
    difficulty: 'medium',
    stem: 'Complete the statement about where each kind of state lives when Copilot works on a task.',
    template:
      'The requirements and acceptance criteria live in the [[1]], the current implementation state (branch, commits, checks and review) lives in the [[2]], and a machine-readable analysis report produced during a CI run is kept as a [[3]].',
    slots: [
      {
        options: ['pull request', 'issue', 'workflow artifact', 'chat history'],
        answer: 'issue',
        explanation: 'The issue defines the task and how it will be accepted.',
      },
      {
        options: ['issue', 'chat history', 'pull request', 'workflow artifact'],
        answer: 'pull request',
        explanation: 'The pull request anchors the implementation: its branch, commits, checks and review.',
      },
      {
        options: ['workflow artifact', 'pull request', 'issue', 'chat history'],
        answer: 'workflow artifact',
        explanation: 'Artifacts keep files produced by a run, attached to that run.',
      },
    ],
    explanation:
      'Each artifact has one job, and choosing the right one matters when work is resumed elsewhere: chat history is neither shared nor authoritative, so it is never the source of truth.',
  }),
  q({
    id: 'ap-text-7',
    objective: '5.4',
    type: 'text_fill',
    difficulty: 'hard',
    stem: 'Complete the statement about invocation settings in custom agent profiles.',
    template:
      'Set [[1]] on an agent that people should pick explicitly but that the model must never choose on its own. Set [[2]] on a helper agent that only other agents should use.',
    slots: [
      {
        options: ['`user-invocable: false`', '`disable-model-invocation: true`', '`infer: true`', '`tools: []`'],
        answer: '`disable-model-invocation: true`',
        explanation: 'It stops automatic selection by the model; the agent can still be picked by hand.',
      },
      {
        options: ['`disable-model-invocation: true`', '`tools: ["agent"]`', '`user-invocable: false`', '`infer: false`'],
        answer: '`user-invocable: false`',
        explanation: 'It hides the agent from manual selection while the model can still invoke it.',
      },
    ],
    explanation:
      'The two switches are independent: `disable-model-invocation` governs the model, `user-invocable` governs people. `infer` is retired in favor of these two, and `tools` controls what an agent can do, not who can invoke it.',
  }),
  q({
    id: 'ap-text-8',
    objective: '6.2',
    type: 'text_fill',
    difficulty: 'easy',
    stem: 'Complete the statement about status checks.',
    template:
      'A check that is not marked as required [[1]] merging when it fails. Marking it as a required status check makes a failing or missing result [[2]] the merge.',
    slots: [
      {
        options: ['blocks', 'does not block', 'reverts'],
        answer: 'does not block',
        explanation: 'An ordinary check is informational; the merge button stays available.',
      },
      {
        options: ['not affect', 'block', 'revert'],
        answer: 'block',
        explanation: 'A required check must report success; one that failed or never reported keeps the pull request from merging.',
      },
    ],
    explanation: 'Agents can make every check green or red, so which checks are required is the policy that actually gates their work.',
  }),
  q({
    id: 'ap-text-9',
    objective: '5.1',
    type: 'text_fill',
    difficulty: 'medium',
    stem: 'Complete the statement about isolation versus mutual exclusion.',
    template:
      'Two coding agents that change different files can work in parallel safely when each works on [[1]]. Two runs of the same deployment workflow are kept from overlapping by [[2]], not by branches.',
    slots: [
      {
        options: ['the same branch, pushing in turn', 'its own branch and pull request', 'a shared concurrency group'],
        answer: 'its own branch and pull request',
        explanation: 'Separate branches isolate work in progress, and each pull request gets its own checks and review.',
      },
      {
        options: ['separate branches', '`needs`', 'a concurrency group'],
        answer: 'a concurrency group',
        explanation: 'Deployments act on shared environments, so they need mutual exclusion; `needs` only orders jobs within one run.',
      },
    ],
    explanation: 'Branches isolate changes to code; concurrency groups serialize actions on shared resources. Each solves a different kind of conflict.',
  }),
  q({
    id: 'ap-text-10',
    objective: '2.4',
    type: 'text_fill',
    difficulty: 'medium',
    stem: 'Complete the statement about a common concurrency group.',
    template:
      "In `group: ${{ github.workflow }}-${{ github.ref }}`, the workflow part keeps [[1]] out of each other's group, and the ref part keeps [[2]] out of each other's group.",
    slots: [
      {
        options: ['different workflows on the same branch', 'runs of the same workflow on different branches', 'jobs in the same run'],
        answer: 'different workflows on the same branch',
        explanation: 'Group names are shared across the repository; the workflow name keeps, say, `ci` and `docs` apart.',
      },
      {
        options: ['jobs in the same run', 'different workflows on the same branch', 'runs of the same workflow on different branches'],
        answer: 'runs of the same workflow on different branches',
        explanation: 'Each branch (or pull request) gets its own group, so work on one does not cancel work on another.',
      },
    ],
    explanation: 'Each part of the key narrows who competes. Removing either one makes the group too broad and cancels or queues unrelated runs.',
  }),

  // ── Yes/No and True/False statement grids ───────────────────────────────────────────────────────
  q({
    id: 'ap-grid-1',
    objective: '2.1',
    type: 'yes_no_grid',
    difficulty: 'medium',
    stem: 'The only change requested is: "Run the analyzer workflow on `pull_request` as well as on `push`." A teammate\'s draft touches the files below. Should each file be modified for this change?',
    slots: [
      {
        prompt: '`.github/workflows/analyzers.yml`',
        answer: 'Yes',
        explanation: "Triggers are defined in the workflow file's `on:` block.",
      },
      {
        prompt: '`.github/agents/analyzer.agent.md`',
        answer: 'No',
        explanation: 'The agent profile defines what the agent does and which tools it has, not when a workflow runs.',
      },
      {
        prompt: '`.github/copilot-instructions.md`',
        answer: 'No',
        explanation: 'Repository-wide instructions affect every Copilot request, and nothing about them changes.',
      },
      {
        prompt: '`.github/CODEOWNERS`',
        answer: 'No',
        explanation: 'File ownership is unchanged by a new trigger.',
      },
    ],
    explanation:
      'Keep a change to its smallest surface: a trigger lives in the workflow file only. Editing agent profiles or shared instructions for a pipeline change widens the review and can change behavior elsewhere.',
  }),
  q({
    id: 'ap-grid-2',
    objective: '5.4',
    type: 'yes_no_grid',
    difficulty: 'medium',
    stem: 'Evaluate each statement about a summarizer agent that reports on the work of planner, coder and reviewer agents.',
    slots: [
      {
        prompt: 'The job that runs the summarizer should list every job whose output it summarizes under `needs`.',
        answer: 'Yes',
        explanation: 'Otherwise it can start early and read missing outputs, and it cannot read their outputs from the `needs` context.',
      },
      {
        prompt: "Leaving `tools` out of the summarizer's profile is the safest way to keep it read-only.",
        answer: 'No',
        explanation: 'An omitted `tools` list grants every tool, including edit and execute.',
      },
      {
        prompt: '`tools: ["read", "search"]` lets the summarizer read and search files but not edit them or run shell commands.',
        answer: 'Yes',
        explanation: 'An explicit list is an allow list; `edit` and `execute` are not on it.',
      },
      {
        prompt: "If the planner's artifact is missing, the summarizer should rebuild the plan from commit messages and present it as the plan.",
        answer: 'No',
        explanation: 'A missing upstream output is reported as missing, with who should provide it; inventing it hides the failure.',
      },
    ],
    explanation: 'A summarizer depends on its upstream agents, reads with the least access it needs, and reports gaps instead of filling them.',
  }),
  q({
    id: 'ap-grid-3',
    objective: '5.1',
    type: 'yes_no_grid',
    difficulty: 'medium',
    stem: `Evaluate each statement about this workflow.

\`\`\`yaml
jobs:
  planner:
    runs-on: ubuntu-latest
    steps:
      - run: ./agents/plan.sh
  risk-review:
    runs-on: ubuntu-latest
    steps:
      - run: ./agents/risk-review.sh
  plan-merger:
    needs: [planner, risk-review]
    runs-on: ubuntu-latest
    steps:
      - run: ./agents/merge-plan.sh
  coder:
    needs: plan-merger
    runs-on: ubuntu-latest
    steps:
      - run: ./agents/code.sh
\`\`\``,
    slots: [
      {
        prompt: '`planner` and `risk-review` can start at the same time.',
        answer: 'Yes',
        explanation: 'Neither has `needs`, so both start as soon as runners are available.',
      },
      {
        prompt: '`plan-merger` starts as soon as `planner` finishes, even if `risk-review` is still running.',
        answer: 'No',
        explanation: 'A job waits for every job in its `needs` list.',
      },
      {
        prompt: 'If `risk-review` fails, `plan-merger` is skipped.',
        answer: 'Yes',
        explanation: 'A job runs only if every job it needs succeeded, unless its `if` says otherwise.',
      },
      {
        prompt: 'If `risk-review` fails, `coder` still runs, because it only lists `plan-merger` under `needs`.',
        answer: 'No',
        explanation: 'A skipped dependency skips its dependents too, so the failure propagates down the chain.',
      },
    ],
    explanation: 'Read a `needs` graph as a dependency graph: roots start together, joins wait for all inputs, and a failure skips everything downstream by default.',
  }),
  q({
    id: 'ap-grid-4',
    objective: '5.4',
    type: 'yes_no_grid',
    difficulty: 'hard',
    stem: `An orchestrator custom agent delegates work to other custom agents. The relevant frontmatter is shown; fields not shown keep their defaults. Evaluate each statement.

\`\`\`yaml
# orchestrator.agent.md
tools: ["read", "search", "agent"]

# test-writer.agent.md
user-invocable: false

# db-migrator.agent.md
disable-model-invocation: true

# legacy-helper.agent.md
user-invocable: false
disable-model-invocation: true
\`\`\``,
    slots: [
      {
        prompt: 'A developer can pick `test-writer` from the agent picker.',
        answer: 'No',
        explanation: '`user-invocable: false` removes it from manual selection.',
      },
      {
        prompt: 'The orchestrator can hand a task to `test-writer` automatically.',
        answer: 'Yes',
        explanation: 'Model invocation stays enabled by default, and the orchestrator has the `agent` tool that invokes other custom agents.',
      },
      {
        prompt: 'The orchestrator can hand a migration task to `db-migrator` automatically.',
        answer: 'No',
        explanation: '`disable-model-invocation: true` stops the model from choosing it.',
      },
      {
        prompt: 'A developer can still select `db-migrator` manually.',
        answer: 'Yes',
        explanation: '`user-invocable` defaults to `true`.',
      },
      {
        prompt: '`legacy-helper` can be reached neither by a developer nor by automatic selection.',
        answer: 'Yes',
        explanation: 'Both routes are switched off, which effectively retires the agent.',
      },
    ],
    explanation:
      'Two independent switches: `user-invocable` governs people, `disable-model-invocation` governs the model. A parent also needs the `agent` tool before it can delegate at all.',
  }),
  q({
    id: 'ap-grid-5',
    objective: '5.1',
    type: 'yes_no_grid',
    difficulty: 'medium',
    labels: ['True', 'False'],
    stem: 'Two coding agents run at the same time. Agent A changes only `docs/**`; agent B changes only `services/billing/**`. A third task, C, needs both changes. Mark each statement True or False.',
    slots: [
      {
        prompt: 'A and B can run in parallel, each on its own branch and pull request.',
        answer: 'True',
        explanation: 'Their paths are disjoint, so isolating them on branches is enough.',
      },
      {
        prompt: 'If A and B both edited `package-lock.json`, separate branches would guarantee a conflict-free merge.',
        answer: 'False',
        explanation: 'Branches isolate work in progress; overlapping edits still conflict, or clash silently, when the second one merges.',
      },
      {
        prompt: 'Putting A and B in the same Actions concurrency group would make overlapping edits merge cleanly.',
        answer: 'False',
        explanation: 'Concurrency only serializes runs; it does not reconcile file contents.',
      },
      {
        prompt: 'C must wait for both A and B, and start from a state that contains both changes.',
        answer: 'True',
        explanation: 'A dependent task depends on every input it builds on.',
      },
    ],
    explanation: 'Parallelize what is independent, serialize what shares state, and make dependents wait for all their inputs.',
  }),
  q({
    id: 'ap-grid-6',
    objective: '1.1',
    type: 'yes_no_grid',
    difficulty: 'medium',
    stem: 'Copilot is working on a pull request that it opened from an issue you assigned to it. Evaluate each statement.',
    slots: [
      {
        prompt: 'The pull request, not the issue, is where you check which commits Copilot has pushed.',
        answer: 'Yes',
        explanation: 'Commits land on the pull request branch and are listed on the pull request.',
      },
      {
        prompt: 'To give Copilot extra guidance while it works, you can comment on its pull request and mention `@copilot`.',
        answer: 'Yes',
        explanation: 'Copilot picks up pull request comments that mention it and keeps iterating on the same branch.',
      },
      {
        prompt: 'Copilot can approve its own pull request so that it merges once the checks pass.',
        answer: 'No',
        explanation: 'Copilot cannot approve or merge its own pull requests; a person reviews them.',
      },
      {
        prompt: 'When approvals are required, the person who asked Copilot for the change can be the one who approves it.',
        answer: 'No',
        explanation: "Copilot's pull requests need independent review: the developer who asked for the change cannot approve it, so someone else must.",
      },
    ],
    explanation: 'The issue starts the task; the pull request is where the work, the steering and the human review happen.',
  }),
  q({
    id: 'ap-grid-7',
    objective: '6.2',
    type: 'yes_no_grid',
    difficulty: 'medium',
    labels: ['True', 'False'],
    stem: 'Mark each statement about pull request guardrails True or False.',
    slots: [
      {
        prompt: 'A `CODEOWNERS` file on its own blocks merging until an owner approves.',
        answer: 'False',
        explanation: 'It requests owners; a ruleset must require their review.',
      },
      {
        prompt: 'A ruleset that requires a pull request and "Require review from Code Owners" blocks merging until an owner listed in `CODEOWNERS` approves.',
        answer: 'True',
        explanation: 'That combination turns ownership into a merge condition.',
      },
      {
        prompt: 'Required status checks guarantee that a person has looked at the change.',
        answer: 'False',
        explanation: 'Checks are automated; only a required review involves a person.',
      },
      {
        prompt: 'A `preToolUse` hook can stop an agent from running a command before it runs.',
        answer: 'True',
        explanation: 'The hook runs before the tool call and can deny it.',
      },
      {
        prompt: 'An environment with required reviewers pauses the job that references it until someone approves.',
        answer: 'True',
        explanation: 'The job waits in the queue until an approver allows it.',
      },
    ],
    explanation: 'Know what each guardrail can and cannot promise: automation proves behavior, reviews prove human attention, and hooks act before the fact.',
  }),
  q({
    id: 'ap-grid-8',
    objective: '2.4',
    type: 'yes_no_grid',
    difficulty: 'hard',
    stem: `A deployment job declares:

\`\`\`yaml
concurrency:
  group: production
  cancel-in-progress: false
\`\`\`

Evaluate each statement.`,
    slots: [
      {
        prompt: 'A new run of this job waits while another run in the `production` group is in progress.',
        answer: 'Yes',
        explanation: 'With `cancel-in-progress: false` the newcomer becomes pending instead of cancelling.',
      },
      {
        prompt: 'If three runs are triggered while one is deploying, all three wait in a queue and deploy in order.',
        answer: 'No',
        explanation: 'With no `queue` setting (the default, `queue: single`) a group holds one pending run: each newer run cancels the one already waiting, so only the latest deploys next. `queue: max` would keep up to 100 waiting, in order.',
      },
      {
        prompt: '`concurrency` can also be set at the top of the workflow, for the whole run.',
        answer: 'Yes',
        explanation: 'It is valid at workflow level and at job level.',
      },
      {
        prompt: "Because the deploy job sets `concurrency`, the workflow's `test` jobs from two different runs cannot overlap either.",
        answer: 'No',
        explanation: 'Job-level concurrency applies only to the job that declares it.',
      },
    ],
    explanation: 'Know exactly what a concurrency group guarantees: one in progress, by default at most one pending, and only for the scope where it is declared.',
  }),

  // ── File and directory locations ────────────────────────────────────────────────────────────────
  q({
    id: 'ap-mc-1',
    objective: '2.1',
    type: 'multiple_choice',
    difficulty: 'medium',
    stem: 'Your repository has five custom agents. You need to narrow the responsibilities of the `security-reviewer` agent only; every other agent must behave exactly as before. Which file do you edit?',
    options: [
      'A. `.github/copilot-instructions.md`',
      'B. `.github/workflows/security-reviewer.yml`',
      'C. `.github/agents/security-reviewer.agent.md`',
      'D. `.github/copilot/agents/security-reviewer.yml`',
    ],
    correct: 'C',
    explanation:
      "Each custom agent's role, instructions and tools live in its own profile, `.github/agents/<name>.agent.md`, so editing it changes that agent only. The repository-wide instructions (A) apply to every Copilot request, a workflow file (B) controls when automation runs, not what an agent is, and `.github/copilot/agents/` (D) is not a location GitHub reads.",
  }),
  q({
    id: 'ap-mc-2',
    objective: '1.1',
    type: 'multiple_choice',
    difficulty: 'easy',
    stem: 'Which file holds the repository-wide custom instructions that Copilot applies to requests in the repository?',
    options: [
      'A. `.github/agents/copilot.agent.md`',
      'B. `.github/copilot-instructions.md`',
      'C. `.vscode/settings.json`',
      'D. `.github/workflows/copilot-instructions.yml`',
    ],
    correct: 'B',
    explanation:
      'Repository-wide instructions go in `.github/copilot-instructions.md`. An `.agent.md` file (A) defines one custom agent and applies only when that agent is used, `.vscode/settings.json` (C) holds editor settings, and anything in `.github/workflows/` (D) is treated as an Actions workflow.',
  }),
  q({
    id: 'ap-mc-3',
    objective: '2.1',
    type: 'multiple_choice',
    difficulty: 'medium',
    stem: 'You are adding a `release-notes` custom agent that should be available in this repository. Where do you create its profile?',
    options: [
      'A. `AGENTS.md` at the repository root, in a new "release-notes" section',
      'B. `.github/agents/release-notes.agent.md`',
      'C. `.github/workflows/release-notes.agent.md`',
      'D. `.agents/release-notes.md`',
    ],
    correct: 'B',
    explanation:
      'Repository custom agents are Markdown profiles with YAML frontmatter in `.github/agents/`, conventionally named `<name>.agent.md`. `AGENTS.md` (A) holds agent instructions, not agent profiles; `.github/workflows/` (C) only holds Actions workflows; and `.agents/` (D) is not where GitHub looks for custom agent profiles.',
  }),
  q({
    id: 'ap-mc-4',
    objective: '6.2',
    type: 'multiple_choice',
    difficulty: 'easy',
    stem: 'Changes to `infra/**` must automatically request a review from `@contoso/sre`. Where do you declare that?',
    options: [
      'A. `.github/agents/sre.agent.md`',
      'B. An "Owners" section in `.github/copilot-instructions.md`',
      'C. `.github/workflows/CODEOWNERS.yml`',
      'D. `.github/CODEOWNERS`',
    ],
    correct: 'D',
    explanation:
      'GitHub reads CODEOWNERS from `.github/`, the repository root or `docs/`, and requests review from the owners of every changed path. Agent profiles and instructions steer Copilot but never assign reviewers. To make the review mandatory, also enable "Require review from Code Owners".',
  }),
  q({
    id: 'ap-mc-5',
    objective: '2.1',
    type: 'multiple_choice',
    difficulty: 'hard',
    stem: 'Your organization wants one `compliance-checker` custom agent that every repository in the organization can use, maintained in one place. Where do you put its profile?',
    options: [
      'A. In `.github/agents/` of every repository',
      "B. In `agents/compliance-checker.agent.md` in the organization's `.github-private` repository",
      "C. In `.github/agents/` of the organization's public `.github` repository",
      'D. In `.github/copilot-instructions.md` of the most active repository',
    ],
    correct: 'B',
    explanation:
      'Organization-level custom agents live in the root `agents/` directory of the organization\'s `.github-private` (or `.github`) repository and are available across the organization. Copies in every repository (A) are not maintained in one place, and a repository copy with the same name overrides the organization one. C uses the repository-level path `.github/agents/`, which makes the agent available in that one repository only.',
  }),
  q({
    id: 'ap-mc-6',
    objective: '2.2',
    type: 'multiple_choice',
    difficulty: 'medium',
    stem: 'Everyone who opens the repository in VS Code should get the same MCP server configured for Copilot. Where do you define it?',
    options: [
      'A. `.github/copilot-instructions.md`',
      "B. `mcp-servers` in a custom agent's frontmatter under `.github/agents/`",
      'C. `.vscode/mcp.json`',
      'D. `.github/workflows/mcp.yml`',
    ],
    correct: 'C',
    explanation:
      'VS Code reads workspace MCP servers from `.vscode/mcp.json`, which is committed with the repository. The `mcp-servers` frontmatter key (B) configures MCP for a custom agent on GitHub.com and is not used by VS Code custom agents. Instructions (A) cannot configure servers, and a workflow (D) runs in Actions, not in the editor.',
  }),

  // ── Summarizer / aggregator agent ───────────────────────────────────────────────────────────────
  q({
    id: 'ap-mc-7',
    objective: '5.2',
    type: 'multiple_choice',
    difficulty: 'hard',
    stem: `A summarizer agent must read the plan, review and test files that earlier jobs downloaded into \`handoff/\`, and write a handoff report for a person. It must never change code, merge or deploy. Which profile is correct?

Profile 1:
\`\`\`markdown
---
name: handoff-summarizer
description: Summarizes upstream agent results into a handoff report.
---
Read the files in handoff/ and write the report.
Fix small problems you notice so the report can say "all green".
\`\`\`

Profile 2:
\`\`\`markdown
---
name: handoff-summarizer
description: Summarizes planner, coder and reviewer results into a handoff report. Read-only.
tools: ["read", "search"]
---
Inputs: plan.md, review.json and test-report.json in handoff/.
Report sections: Summary, Upstream agent results (name the agent for
each), Evidence (links), Risks, Unresolved items, Recommended next owner.
If an input is missing or two inputs conflict, list it under Unresolved
items. Never edit files, merge, or deploy.
\`\`\`

Profile 3:
\`\`\`markdown
---
name: handoff-summarizer
description: Summarizes upstream agent results into a handoff report.
infer: true
tools: ["read", "search", "edit"]
---
Summarize handoff/ and update CHANGELOG.md with the result.
\`\`\`

Profile 4:
\`\`\`markdown
---
name: handoff-summarizer
tools: ["read", "search"]
---
Inputs: plan.md, review.json and test-report.json in handoff/.
Report what each upstream agent concluded. Never edit files.
\`\`\``,
    options: ['A. Profile 1', 'B. Profile 2', 'C. Profile 3', 'D. Profile 4'],
    correct: 'B',
    explanation:
      'Profile 2 has the required `description`, restricts tools to reading and searching, names its inputs and output sections, attributes results to agents, and says what to do about missing or conflicting inputs. Profile 1 omits `tools`, which grants every tool, and invites edits. Profile 3 uses the retired `infer` field and grants `edit` for a changelog task outside its role. Profile 4 is read-only but lacks `description`, the one required field, and has no output structure or escalation rule.',
  }),
  q({
    id: 'ap-mc-8',
    objective: '1.2',
    type: 'multiple_choice',
    difficulty: 'medium',
    stem: "A summarizer agent is drafting a handoff report. The planner and coder artifacts are present, but the reviewer's `review.json` is missing because the reviewer job timed out. What should the summarizer's instructions tell it to do?",
    options: [
      'A. Report that no blocking issues were found, since the reviewer raised none',
      "B. Run the reviewer's checks itself so the report is complete",
      'C. List the missing review under Unresolved items, name the agent that should have produced it, and recommend re-running the reviewer',
      'D. Leave the reviewer section out, so the report only contains verified facts',
    ],
    correct: 'C',
    explanation:
      'A summarizer reports the state it was given, gaps included. Treating silence as a pass (A) invents a result, doing the review itself (B) widens its scope and needs tools it should not have, and dropping the section (D) hides that the review never happened. Naming the gap, its source and the next owner lets a person decide.',
  }),
  q({
    id: 'ap-ms-1',
    objective: '5.2',
    type: 'multi_select',
    difficulty: 'medium',
    stem: "Which THREE instructions belong in the body of a summarizer agent's profile? (Select 3.)",
    options: [
      'A. Attribute each result to the upstream agent that produced it',
      'B. If tests failed, patch the failing code before writing the summary',
      'C. When the reviewer and the coder disagree, report both positions under Unresolved items instead of choosing one',
      'D. Merge the pull request once every upstream agent reports success',
      'E. Link each statement to the check run or artifact it is based on',
      "F. If the reviewer's output is missing, fill in the most likely result",
    ],
    correct: 'A,C,E',
    explanation:
      'Attribution, preserved evidence and honest reporting of conflicts are what make a summary trustworthy. Patching code (B) and merging (D) are actions outside a read-only summarizer role, and guessing a missing result (F) hides a failure behind an invented conclusion.',
  }),

  // ── Agent dependencies and orchestration ────────────────────────────────────────────────────────
  q({
    id: 'ap-mc-9',
    objective: '5.1',
    type: 'multiple_choice',
    difficulty: 'hard',
    stem: 'In a workflow, `coder` needs `planner` and `reviewer` needs `coder`. The `summarizer` job reads `needs.planner.outputs.plan_id`, `needs.coder.outputs.pr_number` and `needs.reviewer.outputs.verdict`. Which configuration for `summarizer` is correct?',
    options: [
      'A. `needs: reviewer`',
      'B. `needs: [planner, coder, reviewer]`',
      'C. `needs: planner` with `if: always()`',
      'D. `concurrency: summarizer` with no `needs`',
    ],
    correct: 'B',
    explanation:
      '`needs: reviewer` alone (A) would still wait for the whole chain, since `reviewer` cannot finish before the jobs it needs, but the `needs` context only contains jobs listed directly, so `needs.planner` and `needs.coder` would be empty. C starts right after the planner, and D does not order jobs at all.',
  }),
  q({
    id: 'ap-mc-10',
    objective: '5.4',
    type: 'multiple_choice',
    difficulty: 'hard',
    stem: 'An orchestrator custom agent has `tools: ["read", "search"]`. Its instructions say: "Delegate implementation to the `coder` agent." The `coder` profile keeps the defaults for `user-invocable` and `disable-model-invocation`. The orchestrator never delegates. What is the cause?',
    options: [
      'A. `coder` must set `user-invocable: false` before another agent can invoke it',
      "B. The orchestrator's `tools` list does not include `agent`, so it cannot invoke other custom agents",
      'C. `coder` must set `disable-model-invocation: true` to be available as a subagent',
      'D. Custom agents can only delegate from a workflow in `.github/workflows/`',
    ],
    correct: 'B',
    explanation:
      'An explicit `tools` list is an allow list, and invoking another custom agent is a tool too (the `agent` alias), so a parent without it cannot hand off, whatever its instructions say. A is not required, C does the opposite (it stops automatic invocation), and D is not how custom agents delegate.',
  }),
  q({
    id: 'ap-mc-11',
    objective: '5.3',
    type: 'multiple_choice',
    difficulty: 'medium',
    stem: `\`analyzer-b\` fails in this workflow. What happens to \`merger\`?

\`\`\`yaml
jobs:
  analyzer-a:
    runs-on: ubuntu-latest
    steps:
      - run: ./analyze-a.sh
  analyzer-b:
    runs-on: ubuntu-latest
    steps:
      - run: ./analyze-b.sh
  merger:
    needs: [analyzer-a, analyzer-b]
    if: \${{ !cancelled() }}
    runs-on: ubuntu-latest
    steps:
      - run: ./merge.sh
\`\`\``,
    options: [
      'A. It is skipped, because one of its dependencies failed',
      'B. It runs once both analyzers have finished, and `needs.analyzer-b.result` is `failure`',
      'C. It waits until `analyzer-b` is retried automatically',
      'D. It starts before `analyzer-a` finishes, because the condition overrides `needs`',
    ],
    correct: 'B',
    explanation:
      "A status function in `if` replaces the default `success()` check, so `merger` runs after a failed dependency, but only once all dependencies have finished; `needs` still orders the jobs. Actions does not retry failed jobs on its own. The merger should check each `needs.<job>.result` and report what is missing instead of failing on an absent artifact.",
  }),

  // ── GitHub Issues and the Copilot task flow ─────────────────────────────────────────────────────
  q({
    id: 'ap-mc-12',
    objective: '1.1',
    type: 'multiple_choice',
    difficulty: 'easy',
    stem: 'The requirements and acceptance criteria for a bug fix are written in issue #482. You want Copilot cloud agent to implement the fix and open a pull request. What do you do?',
    options: [
      'A. Create a branch named `copilot/issue-482` and wait for Copilot to find it',
      'B. Add a `copilot` label to the issue',
      'C. Assign the issue to Copilot',
      'D. Mention the issue number in a commit message on `main`',
    ],
    correct: 'C',
    explanation:
      'Assigning the issue to Copilot hands it the issue as its task: Copilot acknowledges it, creates a `copilot/` branch, opens a draft pull request and pushes its commits there. Branch names, labels and commit messages do not start the agent.',
  }),
  q({
    id: 'ap-mc-13',
    objective: '1.3',
    type: 'multiple_choice',
    difficulty: 'easy',
    stem: 'You assigned an issue to Copilot a few minutes ago. A draft pull request exists but has no code changes yet. Where do you see what the agent is doing, step by step?',
    options: [
      "A. The issue's comment thread",
      'B. The session log, opened from the pull request',
      'C. Repository Insights > Traffic',
      "D. The repository's Actions secrets page",
    ],
    correct: 'B',
    explanation:
      "The session log records the agent's steps and tool calls while it works, and the pull request links to it. The issue only shows that Copilot picked up the task, and Insights and secrets say nothing about this session.",
  }),
  q({
    id: 'ap-mc-14',
    objective: '3.3',
    type: 'multiple_choice',
    difficulty: 'medium',
    stem: 'Copilot cloud agent has pushed several commits to its pull request for issue #77. You now want to continue the work locally in your editor. What carries the implementation state you should start from?',
    options: [
      "A. The issue's description, which Copilot keeps up to date",
      'B. The session state in `~/.copilot/session-state/` on your laptop',
      "C. The pull request's branch, which you check out (for example with `gh pr checkout`)",
      'D. The Copilot Chat history in your editor',
    ],
    correct: 'C',
    explanation:
      "The pull request branch holds the committed work, and the pull request holds its checks and review. The cloud agent's session ran on GitHub, so there is no local session state for it (B); the issue holds requirements, not progress (A); and chat history (D) is neither shared nor authoritative.",
  }),
  q({
    id: 'ap-mc-15',
    objective: '6.2',
    type: 'multiple_choice',
    difficulty: 'medium',
    stem: 'Copilot pushed commits to its pull request, but the checks area says workflows are awaiting approval and nothing has run. What is going on, and what do you do?',
    options: [
      "A. By default, Actions workflows do not run automatically on Copilot's pull requests; someone with write access reviews the changes and approves the workflow runs",
      'B. The agent profile lacks `actions: write`; add it to the frontmatter',
      'C. Branch protection is misconfigured; remove it so that workflows can run',
      'D. Workflows only run once a pull request is marked ready for review; mark it ready',
    ],
    correct: 'A',
    explanation:
      "Running workflows on an agent's commits could expose secrets or a write-scoped token to code no person has read yet, so by default a user with write access must approve the runs (administrators can opt out of this approval). `actions: write` is a workflow token permission, not a frontmatter field (B), and removing protections (C) or changing draft status (D) does not address it.",
  }),
  q({
    id: 'ap-order-1',
    objective: '1.1',
    type: 'drag_drop_order',
    difficulty: 'easy',
    stem: 'Put the flow of a Copilot cloud agent task in order, from requirement to merge.',
    options: [
      'Write the issue with acceptance criteria',
      'Assign the issue to Copilot',
      'Copilot opens a draft pull request from a copilot/ branch',
      'Copilot pushes its commits to that branch',
      'A maintainer approves the workflow runs and the checks report',
      'A human reviewer approves and merges the pull request',
    ],
    correct:
      'Write the issue with acceptance criteria -> Assign the issue to Copilot -> Copilot opens a draft pull request from a copilot/ branch -> Copilot pushes its commits to that branch -> A maintainer approves the workflow runs and the checks report -> A human reviewer approves and merges the pull request',
    explanation:
      'Issue, branch and draft pull request, commits, checks, review: requirements come first, the pull request anchors the work from the moment Copilot opens it, checks run on the pushed commits once approved, and a person makes the merge decision.',
  }),

  // ── Human review and concurrency ────────────────────────────────────────────────────────────────
  q({
    id: 'ap-mc-16',
    objective: '6.2',
    type: 'multiple_choice',
    difficulty: 'hard',
    stem: "A workflow that uses `GITHUB_TOKEN` approved a Copilot pull request, and the approval counted toward the ruleset's required review. Which change stops workflows from doing this?",
    options: [
      'A. Remove `pull-requests: read` from the workflow',
      'B. Add a `concurrency` group to the workflow',
      'C. Enable "Require linear history" on the branch',
      'D. Turn off "Allow GitHub Actions to create and approve pull requests" in the Actions settings',
    ],
    correct: 'D',
    explanation:
      'That setting is what lets `GITHUB_TOKEN` approve pull requests at all; with it off, workflow approvals are rejected. Pair it with required Code Owner review from human teams so that a merge always needs a person. The other options do not govern approvals.',
  }),
  q({
    id: 'ap-mc-17',
    objective: '5.1',
    type: 'multiple_choice',
    difficulty: 'medium',
    stem: `The \`ci\` and \`docs\` workflows both declare the block below. A push to \`main\` triggers both. What happens?

\`\`\`yaml
concurrency:
  group: \${{ github.ref }}
  cancel-in-progress: true
\`\`\``,
    options: [
      'A. Both run independently, because each workflow has its own concurrency groups',
      'B. They share one group, so one of the two runs is cancelled',
      'C. `docs` waits for `ci` to finish, then runs',
      'D. Neither workflow starts, because the group name is used twice',
    ],
    correct: 'B',
    explanation:
      'Concurrency group names are shared by every workflow in the repository. Both runs land in `refs/heads/main`, so the later one cancels the earlier. Adding `${{ github.workflow }}` to the group keeps each workflow in its own group.',
  }),
]
