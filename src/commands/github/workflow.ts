export const GITHUB_WORKFLOW_PATH = '.github/workflows/333-review.yml'
export const GITHUB_SCRIPT_PATH = '.github/scripts/333-review.mjs'

/** GitHub 自有授权；模型由仓库变量和 Secrets 选择，Claude 可选。 */
export type GithubWorkflowSelection = 'review' | 'respond' | 'both'
export function githubWorkflow(selection: GithubWorkflowSelection = 'both'): string {
  const d = '$'
  const reviewTriggers = selection === 'respond' ? [] : [
    '  pull_request_target:',
    '    types: [opened, synchronize, reopened, ready_for_review]',
  ]
  const responseTriggers = selection === 'review' ? [] : [
    '  issue_comment:',
    '    types: [created]',
  ]
  const allowPull = "(github.event_name == 'pull_request_target' && github.event.pull_request.head.repo.full_name == github.repository)"
  const allowComment = `(github.event_name == 'issue_comment' && contains(github.event.comment.body, '@333') && contains(fromJSON('["OWNER","MEMBER","COLLABORATOR"]'), github.event.comment.author_association))`
  const cases = ["github.event_name == 'workflow_dispatch'",
    ...(selection === 'respond' ? [] : [allowPull]),
    ...(selection === 'review' ? [] : [allowComment]),
  ]
  return [
    'name: 333 多模型审查',
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
    '        default: extreme',
    '        options: [normal, deep, security, extreme]',
    ...reviewTriggers,
    ...responseTriggers,
    'permissions:',
    '  contents: read',
    '  pull-requests: write',
    '  issues: write',
    'jobs:',
    '  review:',
    '    if: >-',
    `      ${cases.join(' || ')}`,
    '    runs-on: ubuntu-latest',
    '    timeout-minutes: 45',
    '    steps:',
    '      - uses: actions/checkout@v4',
    '        with:',
    `          ref: ${d}{{ github.event.repository.default_branch }}`,
    '          persist-credentials: false',
    '      - uses: actions/setup-node@v4',
    '        with:',
    '          node-version: 26',
    '      - name: 多模型审查与核验',
    '        env:',
    `          GH_TOKEN: ${d}{{ github.token }}`,
    `          MODEL_API_KEY: ${d}{{ secrets.THREE333_MODEL_API_KEY }}`,
    `          MODEL_PROVIDER: ${d}{{ vars.THREE333_MODEL_PROVIDER }}`,
    `          MODEL_NAME: ${d}{{ vars.THREE333_MODEL_NAME }}`,
    `          MODEL_BASE_URL: ${d}{{ vars.THREE333_MODEL_BASE_URL }}`,
    `          INPUT_PR_NUMBER: ${d}{{ inputs.pr_number }}`,
    `          REVIEW_MODE: ${d}{{ inputs.mode }}`,
    '        run: node .github/scripts/333-review.mjs',
    '      - name: 保存审查证据',
    '        if: always()',
    '        uses: actions/upload-artifact@v4',
    '        with:',
    '          name: 333-review-report',
    '          path: 333-review-report.md',
    '          if-no-files-found: ignore',
  ].join('\n').concat('\n')
}
