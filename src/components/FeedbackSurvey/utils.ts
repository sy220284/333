/** Exact keyboard response mapping in FeedbackSurveyView.tsx. */
export type FeedbackSurveyResponse = 'dismissed' | 'bad' | 'fine' | 'good'

/** Survey origin used for local state and telemetry. */
export type FeedbackSurveyType = 'session' | 'post_compact' | 'memory' | 'skill_improvement'
