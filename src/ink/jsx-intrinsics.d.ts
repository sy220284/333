/**
 * React 19 JSX 入口必须显式登记 Ink 自定义宿主标签。
 *
 * 标签来自 src/ink/dom.ts 的实际节点类型，属性直接关联真实组件和布局类型。
 * 只描述渲染器实际消费的属性，避免用 [key: string]: any 屏蔽错误。
 */
import type { ReactNode } from 'react'
import type { Props as BoxProps } from './components/Box.js'
import type { Styles, TextStyles } from './styles.js'

type InkBoxElementProps = Pick<
  BoxProps,
  | 'ref'
  | 'tabIndex'
  | 'autoFocus'
  | 'onClick'
  | 'onFocus'
  | 'onFocusCapture'
  | 'onBlur'
  | 'onBlurCapture'
  | 'onKeyDown'
  | 'onKeyDownCapture'
  | 'onMouseEnter'
  | 'onMouseLeave'
> & {
  style?: Styles
  children?: ReactNode
}

type InkTextElementProps = {
  style?: Styles
  textStyles?: TextStyles
  children?: ReactNode
}

type InkLinkElementProps = {
  href: string
  children?: ReactNode
}

type InkRawAnsiElementProps = {
  rawText: string
  rawWidth: number
  rawHeight: number
}

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'ink-box': InkBoxElementProps
      'ink-text': InkTextElementProps
      'ink-link': InkLinkElementProps
      'ink-raw-ansi': InkRawAnsiElementProps
    }
  }
}
