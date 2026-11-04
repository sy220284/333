/** Parse workflow metadata as literal data without executing it. */
export function parseWorkflowMetaLiteral(source) {
  if (typeof source !== 'string' || source.length > 65536) throw new Error('Workflow meta literal too large')
  let i = 0
  const fail = () => { throw new Error(`Workflow meta must be a static literal (offset ${i})`) }
  const space = () => { while (i < source.length && /\s/.test(source[i])) i++ }
  function str() {
    const quote = source[i++]
    let result = ''
    while (i < source.length) {
      const c = source[i++]
      if (c === quote) return result
      if (c === '\\') {
        const escaped = source[i++]
        if (escaped === undefined) fail()
        const names = { n:'\n', r:'\r', t:'\t', b:'\b', f:'\f', v:'\v', '0':'\0' }
        if (escaped in names) result += names[escaped]
        else if (escaped === quote || escaped === '\\' || escaped === '"' || escaped === "'") result += escaped
        else if (escaped === 'u' || escaped === 'x') {
          const len = escaped === 'u' ? 4 : 2
          const hex = source.slice(i,i+len)
          if (hex.length !== len || !/^[0-9a-fA-F]+$/.test(hex)) fail()
          result += String.fromCharCode(parseInt(hex,16))
          i += len
        } else fail()
      } else {
        if (c.charCodeAt(0) < 32) fail()
        result += c
      }
    }
    fail()
  }
  function value(depth) {
    if (depth > 12) fail()
    space()
    const c = source[i]
    if (c === "'" || c === '"') return str()
    if (c === '{') {
      i++
      const object = Object.create(null)
      space()
      if (source[i] === '}') { i++; return object }
      while (i < source.length) {
        space()
        let key
        if (source[i] === '"' || source[i] === "'") key = str()
        else {
          const match = /^[A-Za-z_$][\w$]*/.exec(source.slice(i))
          if (!match) fail()
          key = match[0]
          i += key.length
        }
        if (key === '__proto__' || key === 'prototype' || key === 'constructor' || Object.hasOwn(object,key)) fail()
        space()
        if (source[i++] !== ':') fail()
        object[key] = value(depth+1)
        space()
        if (source[i] === '}') { i++; return object }
        if (source[i++] !== ',') fail()
        space()
        if (source[i] === '}') { i++; return object }
      }
      fail()
    }
    if (c === '[') {
      i++
      const values = []
      space()
      if (source[i] === ']') { i++; return values }
      while (i < source.length) {
        values.push(value(depth+1))
        space()
        if (source[i] === ']') { i++; return values }
        if (source[i++] !== ',') fail()
        space()
        if (source[i] === ']') { i++; return values }
      }
      fail()
    }
    const match = /^(?:true|false|null|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)(?![\w$])/.exec(source.slice(i))
    if (!match) fail()
    i += match[0].length
    return match[0] === 'true' ? true : match[0] === 'false' ? false : match[0] === 'null' ? null : Number(match[0])
  }
  const result = value(0)
  space()
  if (i !== source.length || !result || Array.isArray(result) || typeof result !== 'object') fail()
  return result
}
