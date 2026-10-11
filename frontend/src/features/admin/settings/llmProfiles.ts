/**
 * 输出参数档位（温度）。
 *
 * 这里**不含模型名**：模型 ID 由供应商决定且会随版本改名，钉死在预设里会导致
 * 「后台只能在这几个早就过期的名字里选」。模型名请在「模型名称」输入框里直接填，
 * 档位只负责数值参数，不会覆盖它。
 *
 * **也不含生成上限**：那个字段管的是「这次生成总共能产出多少 token」，而思考正文和
 * 最终正文**共用同一份额度** —— 上限给小了不是「输出短一点」，而是**正文一个字都出不来**
 * （实测同一份播报提示词：配 80 → 正文 0 字、结束原因就是「打满上限」；不发 → 正常出 88 字）。
 * 已改为**不发这个字段**，长度交给提示词管。详见 DashScopeChatClient 类注释。
 */
export type LlmParamsPreset = {
  id: string;
  label: string;
  description: string;
  temperature: number;
  assistantTemperature: number;
};

export const LLM_PARAMS_PRESETS: LlmParamsPreset[] = [
  {
    id: "deep-analysis",
    label: "深度分析档",
    description: "低温，适合审计解读这类需要完整推理的生成",
    temperature: 0.3,
    assistantTemperature: 0.7,
  },
  {
    id: "realtime-brief",
    label: "实时播报档",
    description: "高温，适合扫码助手的即时口语播报",
    temperature: 0.7,
    assistantTemperature: 0.9,
  },
];

export const LLM_ENV_HINT = "API Key 可在 DB 配置或设置环境变量 DEEPSEEK_API_KEY。";
