/**
 * Commander help is structured: root/subcommand flags only occur inside its
 * "Options:" block. Command descriptions may themselves contain a "--flag"
 * at the start of a wrapped line; that text is NOT an option of the parent.
 */
export function parseCliHelp(output) {
  const flags = new Set()
  let usage = ''
  let inOptions = false
  for (const line of output.replaceAll('\r\n', '\n').split('\n')) {
    if (!usage && line.startsWith('Usage:')) usage = line.trim()
    const heading = /^([A-Z][A-Za-z ]*):\s*$/.exec(line)
    if (heading) {
      inOptions = heading[1] === 'Options'
      continue
    }
    if (!inOptions) continue
    const item = /^\s+(?:-[a-zA-Z0-9],\s*)?(--[a-z][a-z0-9-]*)(?=\s|$)/.exec(line)
    if (item) flags.add(item[1])
  }
  return { usage, flags: [...flags].sort() }
}
