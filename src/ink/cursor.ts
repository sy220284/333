/**
 * Terminal cursor position in the rendered screen buffer.
 * The Frame constructor and log-update renderer both use zero-based
 * coordinates, with visibility controlled independently from positioning.
 */
export type Cursor = {
  readonly x: number
  readonly y: number
  readonly visible: boolean
}
