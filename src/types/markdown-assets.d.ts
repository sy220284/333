/**
 * Bun's build-time text loader imports repository-bundled skill Markdown
 * as a UTF-8 string. Bundled reference scripts use .txt at build time and
 * recover their original filenames when the skill is extracted.
 * This declaration describes the real compiled import value.
 */
declare module '*.md' {
  const markdownText: string
  export default markdownText
}
declare module '*.txt' {
  const text: string
  export default text
}
