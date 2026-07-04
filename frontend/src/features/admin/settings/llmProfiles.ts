export type LlmProviderId = "deepseek"; // Only DeepSeek now

export type LlmModelPreset = {
  id: string;
  label: string;
  description: string;
  model: string;
  modelFallback: string;
  maxTokens: number;
  temperature: number;
  assistantMaxTokens: number;
  assistantTemperature: number;
};

/** Preset cards that users can click to switch ALL settings at once */
export const LLM_MODEL_PRESETS: LlmModelPreset[] = [
  {
    id: "deepseek-v4-pro",
    label: "DeepSeek V4 Pro",
    description: "最强推理能力，适合复杂分析和洞察生成",
    model: "deepseek-v4-pro",
    modelFallback: "deepseek-v4-flash",
    maxTokens: 2048,
    temperature: 0.3,
    assistantMaxTokens: 120,
    assistantTemperature: 0.7,
  },
  {
    id: "deepseek-v4-flash",
    label: "DeepSeek V4 Flash",
    description: "极速响应，适合实时对话和扫码播报",
    model: "deepseek-v4-flash",
    modelFallback: "deepseek-v4-pro",
    maxTokens: 1024,
    temperature: 0.7,
    assistantMaxTokens: 80,
    assistantTemperature: 0.9,
  },
];

export const DEEPSEEK_BASE_URL = "https://api.deepseek.com";
export const LLM_ENV_HINT = "API Key 可在 DB 配置或设置环境变量 DEEPSEEK_API_KEY。";
