import { TerminalEvent } from './terminal-event.js'

// C1 and ANSI control-string contracts follow the published 2.1.310 binary.
const C1 = new RegExp(String.raw`[\u0090\u0098\u009b\u009d-\u009f]`)
const ESCAPED_C1 = new RegExp(String.raw`\u001b[\u0090\u0098\u009b\u009d-\u009f]`, 'g')
const BARE_C1 = new RegExp(String.raw`[\u0090\u0098\u009b\u009d-\u009f]`, 'g')
const COMPLETE_C1 = new RegExp(String.raw`([\u0090\u0098\u009d-\u009f][^\u0007\u001b\u0090\u0098\u009d-\u009f\r\n]*)\u0007`, 'g')
const BEL_TERMINATED_STRING = new RegExp(String.raw`(\u001b[PX^_][^\u0007\u001b]*)\u0007`, 'g')
const LINE_SEPARATOR = new RegExp(String.raw`(\r\n|\r|\n)`)
const UNPAIRED_SURROGATE = new RegExp(String.raw`[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]`, 'g')

/**
 * DOM-style paste event delivered to the currently focused Ink element.
 * Preserve raw terminal focus markers separately from the normalized text.
 * Target source: 2.1.310 chunk-rwaeax2b.js (PasteEvent constructor).
 */
export class PasteEvent extends TerminalEvent {
  readonly text: string
  readonly rawEmpty: boolean
  readonly rawEndedWithFocusTail: boolean

  constructor(raw: string | PasteEvent) {
    super('paste', { bubbles: true, cancelable: true })
    if (raw instanceof PasteEvent) {
      this.text = raw.text
      this.rawEmpty = raw.rawEmpty
      this.rawEndedWithFocusTail = raw.rawEndedWithFocusTail
      return
    }

    this.rawEmpty = raw.length === 0 || raw === '[I' || raw === '[O'
    this.rawEndedWithFocusTail = raw.endsWith('[I') || raw.endsWith('[O')

    let text = C1.test(raw)
      ? raw.replace(COMPLETE_C1, '$1').replace(ESCAPED_C1, '').replace(BARE_C1, '')
      : raw

    if (text.includes('\x1b')) {
      text = text
        .replace(BEL_TERMINATED_STRING, '$1\x1b\\')
        .split(LINE_SEPARATOR)
        .map((part, index) => (index % 2 === 1 ? part : Bun.stripANSI(part)))
        .join('')
        .replaceAll('\x07', '')
        .replace(UNPAIRED_SURROGATE, '\uFFFD')
    }

    this.text = text
  }
}
