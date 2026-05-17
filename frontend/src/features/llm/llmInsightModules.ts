/** 支持 AI 解读的业务模块（与后端 LlmInsightModules 保持一致） */
export const LLM_INSIGHT_MODULES = [
  {
    reportKey: "isolation_usage",
    label: "隔离服使用统计",
    defaultUserPrompt: `请根据以下隔离服清算快照数据，生成本期管理层会议解读。
重点说明：环比人次变化、主要课题组贡献、区域分布特点，以及需要会上强调的异常或风险。
输出须便于口头汇报。`,
  },
] as const;

export type LlmInsightReportKey = (typeof LLM_INSIGHT_MODULES)[number]["reportKey"];

export function llmInsightModuleLabel(reportKey: string) {
  return LLM_INSIGHT_MODULES.find((m) => m.reportKey === reportKey)?.label ?? reportKey;
}

export function defaultUserPromptForModule(reportKey: string) {
  return (
    LLM_INSIGHT_MODULES.find((m) => m.reportKey === reportKey)?.defaultUserPrompt ??
    "请根据以下统计数据生成管理层会议解读，并突出环比变化与主要驱动因素。"
  );
}
