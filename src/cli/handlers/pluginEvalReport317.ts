import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'

const html = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
}[char]))

export function renderPluginEvalReport317(result) {
  const cases = result.cases.map(item => `
    <section><h2>${html(item.name)}</h2>
    <p>Score: ${item.score === null ? 'n/a' : item.score.toFixed(3)}</p>
    <ul>${item.runs.map(run => `<li>
      <strong>${html(run.arm)} #${run.repeat}</strong>:
      ${run.score === null ? 'n/a' : run.score.toFixed(3)}
      <pre>${html(run.output)}</pre>
      ${run.error ? `<p class="error">${html(run.error)}</p>` : ''}
    </li>`).join('')}</ul></section>`).join('')
  return `<!doctype html><html lang="en"><meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Plugin evaluation</title><style>
  body{font:16px system-ui,sans-serif;max-width:960px;margin:3rem auto;padding:0 1rem}
  section{border-top:1px solid #ccc;padding:1rem 0}
  pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f5f5f5;padding:1rem}
  .error{color:#9b111e}</style><h1>Plugin evaluation</h1>
  <p>Overall score: ${result.score ?? 'n/a'}. Total cost: $${result.costUsd.toFixed(4)}</p>
  ${cases}</html>`
}

export async function savePluginEvalReport317(result, options) {
  const outputDir = resolve(options.outputDir)
  await mkdir(outputDir, { recursive: true })
  const dataFile = join(outputDir, 'aggregate-result.json')
  const reportFile = options.report ? resolve(options.report) : join(outputDir, 'report.html')
  await mkdir(dirname(reportFile), { recursive: true })
  const json = JSON.stringify(result, null, 2) + '\n'
  await writeFile(dataFile, json)
  await writeFile(reportFile, renderPluginEvalReport317(result))
  if (typeof options.json === 'string') {
    const target = resolve(options.json)
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, json)
  } else if (options.json === true) {
    process.stdout.write(json)
  }
  return { dataFile, reportFile }
}
