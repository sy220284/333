/** 反馈调查的四种真实选项和三种事件来源，禁止无效选项进入事件/回调。 */
import type { FeedbackSurveyResponse, FeedbackSurveyType } from '../src/components/FeedbackSurvey/utils.js'

const responses: FeedbackSurveyResponse[] = ['dismissed', 'bad', 'fine', 'good']
const surveyTypes: FeedbackSurveyType[] = ['session', 'memory', 'post_compact']
// @ts-expect-error FeedbackSurveyView 不提供第五种响应
const unknownResponse: FeedbackSurveyResponse = 'excellent'
// @ts-expect-error 来源仅允许三个真实调查入口
const unknownType: FeedbackSurveyType = 'custom'
void [responses, surveyTypes, unknownResponse, unknownType]
