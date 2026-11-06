export const GITHUB_WORKFLOW_PATH = '.github/workflows/yaoyaoche-review.yml'
export const GITHUB_SCRIPT_PATH = '.github/scripts/yaoyaoche-review.mjs'
export const GITHUB_TASK_SCRIPT_PATH = '.github/scripts/yaoyaoche-task.mjs'
export type GithubWorkflowSelection = 'review' | 'respond' | 'both'

/** Generated workflow runs only trusted/default-branch scripts. Fork PRs are
 * inspected as data; only explicitly authorized comments can modify code. */
export function githubWorkflow(selection: GithubWorkflowSelection = 'both'): string {
  const d = '$'
  const membership = "contains(fromJSON('[\"OWNER\",\"MEMBER\",\"COLLABORATOR\"]'), github.event.comment.author_association)"
  const reviews = selection === 'respond' ? [] : [
    '  pull_request_target:',
    '    types: [opened, synchronize, reopened, ready_for_review]',
  ]
  const comments = selection === 'review' ? [] : [
    '  issue_comment:',
    '    types: [created]',
  ]
  const reviewComment = "(github.event_name == 'issue_comment' && startsWith(github.event.comment.body, '/yaoyaoche review') && " + membership + ")"
  const taskComment = "(github.event_name == 'issue_comment' && (startsWith(github.event.comment.body, '/yaoyaoche task ') || startsWith(github.event.comment.body, '/yaoyaoche dev ') || startsWith(github.event.comment.body, '/yaoyaoche 开发 ')) && " + membership + ")"
  const internalPR = "(github.event_name == 'pull_request_target' && github.event.pull_request.head.repo.full_name == github.repository)"
  const reviewCases = ["github.event_name == 'workflow_dispatch'",
    ...(selection === 'respond' ? [] : [internalPR]),
    ...(selection === 'review' ? [] : [reviewComment])]
  return [
    'name: 摇摇车 GitHub 审查与开发',
    'on:',
    '  workflow_dispatch:',
    '    inputs:',
    '      pr_number:',
    '        description: PR 编号',
    '        required: true',
    '        type: string',
    '      mode:',
    '        description: 审查等级',
    '        required: true',
    '        type: choice',
    '        default: normal',
    '        options: [normal, deep, security]',
    ...reviews,
    ...comments,
    'permissions:',
    '  contents: read',
    '  pull-requests: write',
    '  issues: write',
    'jobs:',
    '  review:',
    '    if: >-',
    '      ' + reviewCases.join(' || '),
    '    runs-on: ubuntu-latest',
    '    timeout-minutes: 45',
    '    steps:',
    '      - uses: actions/checkout@v4',
    '        with:',
    '          ref: ' + d + '{{ github.event.repository.default_branch }}',
    '          persist-credentials: false',
    '      - uses: actions/setup-node@v4',
    '        with:',
    '          node-version: 26',
    '      - name: 多模型审查与核验',
    '        env:',
    '          GH_TOKEN: ' + d + '{{ github.token }}',
    '          MODEL_API_KEY: ' + d + '{{ secrets.YAOYAOCHE_MODEL_API_KEY }}',
    '          MODEL_PROVIDER: ' + d + '{{ vars.YAOYAOCHE_MODEL_PROVIDER }}',
    '          MODEL_NAME: ' + d + '{{ vars.YAOYAOCHE_MODEL_NAME }}',
    '          MODEL_BASE_URL: ' + d + '{{ vars.YAOYAOCHE_MODEL_BASE_URL }}',
    '          MODEL_TOKEN_FIELD: ' + d + '{{ vars.YAOYAOCHE_MODEL_TOKEN_FIELD }}',
    '          INPUT_PR_NUMBER: ' + d + '{{ inputs.pr_number }}',
    '          REVIEW_MODE: ' + d + '{{ inputs.mode }}',
    '        run: node .github/scripts/yaoyaoche-review.mjs',
    '      - name: 保存审查证据',
    '        if: always()',
    '        uses: actions/upload-artifact@v4',
    '        with:',
    '          name: yaoyaoche-review-report',
    '          path: yaoyaoche-review-report.md',
    '          if-no-files-found: ignore',
    ...(selection === 'review' ? [] : [
      '  task:',
      '    if: >-',
      '      ' + taskComment,
      '    runs-on: ubuntu-latest',
      '    timeout-minutes: 45',
      '    permissions:',
      '      contents: write',
      '      pull-requests: write',
      '      issues: write',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '        with:',
      '          ref: ' + d + '{{ github.event.repository.default_branch }}',
      '          persist-credentials: false',
      '      - uses: actions/setup-node@v4',
      '        with:',
      '          node-version: 26',
      '      - name: 授权评论开发任务',
      '        env:',
      '          GH_TOKEN: ' + d + '{{ github.token }}',
      '          MODEL_API_KEY: ' + d + '{{ secrets.YAOYAOCHE_MODEL_API_KEY }}',
      '          MODEL_PROVIDER: ' + d + '{{ vars.YAOYAOCHE_MODEL_PROVIDER }}',
      '          MODEL_NAME: ' + d + '{{ vars.YAOYAOCHE_MODEL_NAME }}',
      '          MODEL_BASE_URL: ' + d + '{{ vars.YAOYAOCHE_MODEL_BASE_URL }}',
      '          MODEL_TOKEN_FIELD: ' + d + '{{ vars.YAOYAOCHE_MODEL_TOKEN_FIELD }}',
      '        run: node .github/scripts/yaoyaoche-task.mjs',
      '      - name: 保存开发任务证据',
      '        if: always()',
      '        uses: actions/upload-artifact@v4',
      '        with:',
      '          name: yaoyaoche-task-report',
      '          path: yaoyaoche-task-report.md',
      '          if-no-files-found: error',
    ]),
  ].join('\n').concat('\n')
}
