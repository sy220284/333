/**
 * Bun's build-time text loader imports repository-bundled skill Markdown
 * as a UTF-8 string. 26 original claude-api Markdown files use this form.
 * This declaration describes the real compiled import value.
 */
declare module '*.md' {
  const markdownText: string
  export default markdownText
}
