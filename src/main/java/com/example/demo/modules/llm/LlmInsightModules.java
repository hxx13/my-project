package com.example.demo.modules.llm;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 支持 AI 解读的统计/业务模块（reportKey）。新增模块时在此登记并补充配置种子。
 */
public final class LlmInsightModules {

    public static final String ISOLATION_USAGE = "isolation_usage";

    private static final String DEFAULT_USER_ISOLATION =
            """
                    请根据以下隔离服清算快照数据，生成本期管理层会议解读。
                    重点说明：环比人次变化、主要课题组贡献、区域分布特点，以及需要会上强调的异常或风险。
                    输出须便于口头汇报。""";

    private static final String DEFAULT_SYSTEM =
            """
                    你是动物设施隔离服使用数据的分析助手。根据用户要求与提供的统计快照 JSON，输出面向管理层开会的解读。
                    必须只输出一个 JSON 对象，不要 markdown 包裹，不要额外说明。字段：
                    headline (string, 一句话结论),
                    executiveSummary (string[], 3-5条要点),
                    periodComparison (object: narrative string, highlights string[]),
                    topDrivers (object[]: name, personTimes number, sharePct number|null, note string),
                    regionInsights (object[]: region, personTimes number, note string),
                    meetingTalkingPoints (string[], 3-6条可直接在会上说的句子),
                    risksOrAnomalies (string[]),
                    chartSuggestions (object[]: title, type bar|line, labels string[], values number[])。
                    数字须与输入一致，勿编造未给出的课题组；可合理归纳趋势。""";

    private LlmInsightModules() {}

    public record ModuleMeta(String reportKey, String labelZh, String defaultUserPrompt) {}

    public static List<ModuleMeta> all() {
        return List.of(new ModuleMeta(ISOLATION_USAGE, "隔离服使用统计", DEFAULT_USER_ISOLATION));
    }

    public static String userPromptConfigKey(String reportKey) {
        return "llm.insight_user_prompt." + normalize(reportKey);
    }

    public static String systemPromptConfigKey(String reportKey) {
        return "llm.insight_system_prompt." + normalize(reportKey);
    }

    public static String defaultUserPrompt(String reportKey) {
        return all().stream()
                .filter(m -> m.reportKey().equals(normalize(reportKey)))
                .map(ModuleMeta::defaultUserPrompt)
                .findFirst()
                .orElse("请根据以下统计数据生成管理层会议解读，并突出环比变化与主要驱动因素。");
    }

    public static String defaultSystemPrompt() {
        return DEFAULT_SYSTEM;
    }

    public static String labelZh(String reportKey) {
        return all().stream()
                .filter(m -> m.reportKey().equals(normalize(reportKey)))
                .map(ModuleMeta::labelZh)
                .findFirst()
                .orElse(reportKey);
    }

    public static Map<String, Object> toPromptMap(String reportKey, String userPrompt, String systemPrompt) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("reportKey", normalize(reportKey));
        out.put("moduleLabel", labelZh(reportKey));
        out.put("userPrompt", userPrompt);
        out.put("systemPrompt", systemPrompt);
        out.put("defaultUserPrompt", defaultUserPrompt(reportKey));
        out.put("defaultSystemPrompt", defaultSystemPrompt());
        return out;
    }

    private static String normalize(String reportKey) {
        if (reportKey == null || reportKey.isBlank()) {
            return ISOLATION_USAGE;
        }
        return reportKey.trim();
    }
}
