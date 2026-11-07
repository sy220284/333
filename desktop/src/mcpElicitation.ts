/** Validate values entered by the desktop MCP elicitation form before sending
 * "accept" to the SDK. MCP servers supply JSON Schema, not a trusted UI form. */
type JsonObject = Record<string, unknown>

function record(value: unknown): JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonObject
    : {}
}

export function prepareMcpElicitationContent(
  requestedSchema: unknown,
  form: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const schema = record(requestedSchema)
  const properties = record(schema.properties)
  const required = new Set(Array.isArray(schema.required)
    ? schema.required.filter((name): name is string => typeof name === 'string')
    : [])
  for (const name of required) {
    if (!Object.hasOwn(properties, name))
      throw new Error(`MCP 表单的必填字段没有定义：${name}`)
  }
  const content: Record<string, unknown> = {}
  for (const [name, rawField] of Object.entries(properties)) {
    const field = record(rawField)
    const kind = field.type ?? (Array.isArray(field.enum) && field.enum.length
      ? typeof field.enum[0] : 'string')
    if (!['string', 'boolean', 'number', 'integer'].includes(String(kind)))
      throw new Error(`MCP 表单暂不支持字段 ${name} 的类型 ${String(kind)}`)
    const provided = Object.hasOwn(form, name)
    const value = provided ? form[name] : kind === 'boolean' ? false : undefined
    if (value === undefined || value === null || value === '') {
      if (required.has(name)) throw new Error(`请填写 MCP 必填字段：${name}`)
      continue
    }
    if (kind === 'string') {
      if (typeof value !== 'string') throw new Error(`MCP 字段 ${name} 需要文本`)
      const length = [...value].length
      if (typeof field.minLength === 'number' && length < field.minLength)
        throw new Error(`MCP 字段 ${name} 至少需要 ${field.minLength} 个字符`)
      if (typeof field.maxLength === 'number' && length > field.maxLength)
        throw new Error(`MCP 字段 ${name} 最多允许 ${field.maxLength} 个字符`)
    } else if (kind === 'boolean') {
      if (typeof value !== 'boolean') throw new Error(`MCP 字段 ${name} 需要是或否`)
    } else {
      if (typeof value !== 'number' || !Number.isFinite(value) ||
          (kind === 'integer' && !Number.isInteger(value)))
        throw new Error(`MCP 字段 ${name} 需要${kind === 'integer' ? '整数' : '有效数字'}`)
      if (typeof field.minimum === 'number' && value < field.minimum)
        throw new Error(`MCP 字段 ${name} 不得小于 ${field.minimum}`)
      if (typeof field.maximum === 'number' && value > field.maximum)
        throw new Error(`MCP 字段 ${name} 不得大于 ${field.maximum}`)
      if (typeof field.exclusiveMinimum === 'number' && value <= field.exclusiveMinimum)
        throw new Error(`MCP 字段 ${name} 必须大于 ${field.exclusiveMinimum}`)
      if (typeof field.exclusiveMaximum === 'number' && value >= field.exclusiveMaximum)
        throw new Error(`MCP 字段 ${name} 必须小于 ${field.exclusiveMaximum}`)
    }
    if (Array.isArray(field.enum) && !field.enum.some(candidate => Object.is(candidate, value)))
      throw new Error(`MCP 字段 ${name} 需要从给定选项中选择`)
    content[name] = value
  }
  return content
}
