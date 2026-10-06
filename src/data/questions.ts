export type QuestionKey = 'airSensitivity' | 'heatAvoidance' | 'tradeoff';
export type Question = {
  key: QuestionKey;
  title: string;
  hint?: string;
  options: { value: string; label: string }[];
};
export const QUESTIONS: Question[] = [
  {
    key: 'airSensitivity',
    title: 'How sensitive are you to air pollution?',
    options: [
      { value: 'low', label: 'Not much' },
      { value: 'medium', label: 'Somewhat' },
      { value: 'high', label: 'I strongly prefer cleaner air' },
    ],
  },
  {
    key: 'heatAvoidance',
    title: 'How much do you want to avoid heat?',
    options: [
      { value: 'low', label: "I'm okay with heat" },
      { value: 'medium', label: 'Prefer less heat' },
      { value: 'high', label: 'Avoid heat whenever possible' },
    ],
  },
  {
    key: 'tradeoff',
    title: 'What are you willing to trade for a cleaner commute?',
    hint: 'This shapes your routes the most.',
    options: [
      { value: 'time', label: "⚡ Save time — I'll tolerate some exposure" },
      { value: 'exposure', label: "🌿 Reduce exposure — I'll take a little longer" },
      { value: 'balanced', label: '⚖️ Balance both' },
    ],
  },
];
export const labelFor = (key: QuestionKey, value?: string) =>
  QUESTIONS.find(q => q.key === key)?.options.find(o => o.value === value)?.label ?? 'Not set';
