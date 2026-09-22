/**
 * 输出参数档位（token / 温度）。
 *
 * 这里**不含模型名**：模型 ID 由供应商决定且会随版本改名，钉死在预设里会导致
 * 「后台只能在这几个早就过期的名字里选」。模型名请在「模型名称」输入框里直接填，
 * 档位只负责数值参数，不会覆盖它。
 */
export type LlmParamsPreset = {
  id: string;
  label: string;
  description: string;
  maxTokens: number;
  temperature: number;
  assistantMaxTokens: number;
  assistantTemperature: number;
};

export const LLM_PARAMS_PRESETS: LlmParamsPreset[] = [
  {
    id: "deep-analysis",
    label: "深度分析档",
    description: "长输出、低温，适合审计解读这类需要完整推理的生成",
    maxTokens: 2048,
    temperature: 0.3,
    assistantMaxTokens: 120,
    assistantTemperature: 0.7,
  },
  {
    id: "realtime-brief",
    label: "实时播报档",
    description: "短输出、高温，适合扫码助手的即时口语播报",
    maxTokens: 1024,
    temperature: 0.7,
    assistantMaxTokens: 80,
    assistantTemperature: 0.9,
  },
];

export const LLM_ENV_HINT = "API Key 可在 DB 配置或设置环境变量 DEEPSEEK_API_KEY。";
