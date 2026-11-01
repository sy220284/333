/**
 * 多步骤向导的类型契约。
 * 依据 2.1.88 WizardProvider.tsx 内嵌 sourcesContent
 * 恢复泛型参数、上下文状态、导航行为和完成回调。
 * CreateAgentWizard.tsx 同样保留原始 TypeScript sourcesContent：
 * steps 为 WizardStepComponent<AgentWizardData>[]。
 */
import type {
  ComponentType,
  Dispatch,
  ReactNode,
  SetStateAction,
} from 'react'

export type WizardStepComponent<
  T extends Record<string, unknown> = Record<string, unknown>,
> = ComponentType

export type WizardProviderProps<T extends Record<string, unknown>> = {
  steps: WizardStepComponent<T>[]
  initialData?: T
  onComplete: (data: T) => void | Promise<void>
  onCancel?: () => void
  children?: ReactNode
  title?: string
  showStepCounter?: boolean
}

export type WizardContextValue<T extends Record<string, unknown>> = {
  currentStepIndex: number
  totalSteps: number
  wizardData: T
  setWizardData: Dispatch<SetStateAction<T>>
  updateWizardData: (updates: Partial<T>) => void
  goNext: () => void
  goBack: () => void
  goToStep: (index: number) => void
  cancel: () => void
  title?: string
  showStepCounter: boolean
}
