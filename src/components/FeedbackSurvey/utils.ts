/**
 * 反馈调查类型：根据选择器、会话问卷和事件消费者还原。
 * 2.1.88 FeedbackSurveyView.tsx:14-19 逐项固定输入映射；
 * useFeedbackSurvey.tsx:43,105 使用 session；
 * useMemorySurvey.tsx:73 与 usePostCompactSurvey.tsx:190
 * 分别报告 memory、post_compact。
 *
 * 此文件仅提供被 TypeScript 擦除的类型，不改变反馈/转录分享权限。
 */
export type FeedbackSurveyResponse =
  | 'dismissed'
  | 'bad'
  | 'fine'
  | 'good'

export type FeedbackSurveyType = 'session' | 'memory' | 'post_compact'
