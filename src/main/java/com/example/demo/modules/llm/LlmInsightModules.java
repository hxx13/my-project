package com.example.demo.modules.llm;

import com.example.demo.modules.analytics.service.AnalyticsReportRegistry;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 支持 AI 解读的统计/业务模块（reportKey）。新增模块时在此登记并补充配置种子。
 */
public final class LlmInsightModules {

    public static final String ISOLATION_USAGE = AnalyticsReportRegistry.REPORT_ISOLATION_USAGE;
    public static final String CAGE_OCCUPANCY = AnalyticsReportRegistry.REPORT_CAGE_OCCUPANCY;

    private static final String DEFAULT_USER_ISOLATION =
            """
                    请根据以下隔离服清算快照数据，生成本期管理层会议解读。
                    重点说明：环比条数变化（主口径为清洗总库纳入记录）、主要课题组贡献、区域分布特点，以及需要会上强调的异常或风险。
                    输出须便于口头汇报。""";

    private static final String DEFAULT_USER_CAGE =
            """
                    请根据以下笼架占用清算快照数据，生成本期管理层会议解读。
                    重点说明：环比笼位变化、主要 PI 课题组、各房间占用分布，以及需要会上强调的异常或风险。
                    输出须便于口头汇报。""";

    private static final String DEFAULT_SYSTEM_ISOLATION =
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
                    数字须与输入一致；currentRounds 表示隔离服进出轮次（人次口径）。勿编造未给出的课题组。""";

    private static final String DEFAULT_SYSTEM_CAGE =
            """
                    你是动物设施笼架占用统计的分析助手。根据用户要求与提供的统计快照 JSON，输出面向管理层开会的解读。
                    必须只输出一个 JSON 对象，不要 markdown 包裹，不要额外说明。字段：
                    headline (string, 一句话结论),
                    executiveSummary (string[], 3-5条要点),
                    periodComparison (object: narrative string, highlights string[]),
                    topDrivers (object[]: name, personTimes number, sharePct number|null, note string),
                    regionInsights (object[]: region, personTimes number, note string),
                    meetingTalkingPoints (string[], 3-6条可直接在会上说的句子),
                    risksOrAnomalies (string[]),
                    chartSuggestions (object[]: title, type bar|line, labels string[], values number[])。
                    数字须与输入一致；currentRounds 表示占用笼位数（笼位口径）；byPi 为 PI 课题组，byRoom 为房间。勿编造未给出的课题组。""";

    private static final String DEFAULT_CHAT_ISOLATION =
            """
                    你是实验室隔离服使用统计的分析助手。用户会基于已封箱数据提问。
                    要求：
                    1. 用中文回答，结构清晰，可用小标题与列表；表格请用标准 Markdown 表格（表头行 + 分隔行 |---|---|）。
                    2. 必须基于提供的 JSON 推断，不得编造；JSON 中 metricUnit 多为「条」（清洗总库纳入记录），currentRounds 为主口径条数；aroFlowRooms 为 ARO 流水辅助房间类型。
                    3. 引用 periodLabel、viewName 与字段名；不要输出 JSON，除非用户明确要求。
                    4. 多轮对话时延续上文日期范围：在 periodCatalog（全部期次摘要）与 periods（完整维度子集）中按 periodType+periodLabel 查找；缺失须说明「封箱中无该日快照」并列出 availablePeriodLabels，勿声称整段无数据。""";

    private static final String DEFAULT_CHAT_CAGE =
            """
                    你是实验室笼架占用统计的分析助手。用户会基于已封箱数据提问。
                    要求：
                    1. 用中文回答，结构清晰，可用小标题与列表；表格请用标准 Markdown 表格。
                    2. 必须基于提供的 JSON 推断，不得编造；JSON 中 metricUnit 为「笼位」，currentRounds 为占用笼位数。
                    3. 引用 periodLabel、viewName、byPi（PI课题组）、byRoom（房间）；不要输出 JSON，除非用户明确要求。
                    4. 多轮对话延续上文日期范围；追问其它日期仅使用 availablePeriodLabels/periods 中已有期次，缺失须说明无该日快照。""";

    private LlmInsightModules() {}

    public record ModuleMeta(String reportKey, String labelZh, String defaultUserPrompt) {}

    public static List<ModuleMeta> all() {
        return List.of(
                new ModuleMeta(ISOLATION_USAGE, "隔离服使用统计", DEFAULT_USER_ISOLATION),
                new ModuleMeta(CAGE_OCCUPANCY, "笼架占用统计", DEFAULT_USER_CAGE));
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

    public static String defaultSystemPrompt(String reportKey) {
        String rk = normalize(reportKey);
        if (CAGE_OCCUPANCY.equals(rk)) {
            return DEFAULT_SYSTEM_CAGE;
        }
        return DEFAULT_SYSTEM_ISOLATION;
    }

    public static String defaultChatSystemPrompt(String reportKey) {
        String rk = normalize(reportKey);
        if (CAGE_OCCUPANCY.equals(rk)) {
            return DEFAULT_CHAT_CAGE;
        }
        return DEFAULT_CHAT_ISOLATION;
    }

    public static String labelZh(String reportKey) {
        return all().stream()
                .filter(m -> m.reportKey().equals(normalize(reportKey)))
                .map(ModuleMeta::labelZh)
                .findFirst()
                .orElse(reportKey);
    }

    public static Map<String, Object> toPromptMap(String reportKey, String userPrompt, String systemPrompt) {
        String rk = normalize(reportKey);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("reportKey", rk);
        out.put("moduleLabel", labelZh(rk));
        out.put("userPrompt", userPrompt);
        out.put("systemPrompt", systemPrompt);
        out.put("defaultUserPrompt", defaultUserPrompt(rk));
        out.put("defaultSystemPrompt", defaultSystemPrompt(rk));
        return out;
    }

    private static String normalize(String reportKey) {
        if (reportKey == null || reportKey.isBlank()) {
            return ISOLATION_USAGE;
        }
        return reportKey.trim();
    }
}
