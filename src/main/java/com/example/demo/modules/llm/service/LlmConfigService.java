package com.example.demo.modules.llm.service;

import com.example.demo.modules.llm.LlmInsightModules;
import com.example.demo.modules.llm.LlmProfilePresets;
import com.example.demo.modules.notification.entity.SystemConfigItem;
import com.example.demo.modules.notification.service.NotificationSettingsService;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Service
public class LlmConfigService {

    public static final String MODULE = "llm";

    private final NotificationSettingsService notificationSettingsService;

    public LlmConfigService(NotificationSettingsService notificationSettingsService) {
        this.notificationSettingsService = notificationSettingsService;
    }

    public boolean isEnabled() {
        return "true".equalsIgnoreCase(get("llm.enabled", "false"));
    }

    public String getProvider() {
        String raw = get("llm.provider", "");
        if (StringUtils.hasText(raw)) {
            return raw.trim().toLowerCase();
        }
        return LlmProfilePresets.inferProviderFromBaseUrl(getBaseUrl());
    }

    public String getApiKey() {
        String fromDb = get("llm.api_key", "");
        if (StringUtils.hasText(fromDb)) {
            return fromDb.trim();
        }
        String deepseek = System.getenv("DEEPSEEK_API_KEY");
        if (StringUtils.hasText(deepseek)) {
            return deepseek.trim();
        }
        return "";
    }

    public String getBaseUrl() {
        String url = get("llm.base_url", LlmProfilePresets.DEEPSEEK_BASE_URL);
        if (!StringUtils.hasText(url)) {
            url = LlmProfilePresets.DEEPSEEK_BASE_URL;
        }
        return normalizeOpenAiCompatibleBaseUrl(trimTrailingSlash(url.trim()));
    }

    public String getModel() {
        return get("llm.model", "deepseek-v4-pro");
    }

    /**
     * 主模型 + 备用模型列表（逗号分隔），去重且保持顺序。无需配置全部模型，仅列 2～5 个即可。
     */
    public List<String> getModelCandidates() {
        Set<String> ordered = new LinkedHashSet<>();
        addModels(ordered, getModel());
        addModels(ordered, get("llm.model_fallback", "deepseek-v4-flash"));
        if (ordered.isEmpty()) {
            ordered.add("deepseek-v4-pro");
        }
        return new ArrayList<>(ordered);
    }

    public int getMaxTokens() {
        try {
            return Math.min(Math.max(Integer.parseInt(get("llm.max_tokens", "2048")), 256), 8192);
        } catch (Exception e) {
            return 2048;
        }
    }

    public double getTemperature() {
        try {
            double t = Double.parseDouble(get("llm.temperature", "0.3"));
            return Math.min(Math.max(t, 0), 1);
        } catch (Exception e) {
            return 0.3;
        }
    }

    /** 扫码智能助手是否启用 LLM 播报 */
    public boolean isAssistantEnabled() {
        return isEnabled() && "true".equalsIgnoreCase(get("llm.assistant.enabled", "true"));
    }

    public String getAssistantSystemPrompt() {
        String fromDb = get("llm.assistant.system_prompt", "");
        if (StringUtils.hasText(fromDb)) {
            return fromDb.trim();
        }
        return """
                你是实验室门禁智能助手。你的任务是为刷卡人生成个性化对话播报。

                你的对话风格：像实验室里认识对方的同学，口语中文，自然温暖，不套模板，每次换种说法。

                welcome 场景：系统提示中会包含【持久画像】（用户的固定身份与行为侧写），
                这才是你播报的主要内容——像寒暄一样把画像中的信息自然说出来。
                用户消息中的实时数据（时段、排名等）只做点缀融入，不要喧宾夺主。

                alert 场景：语气严肃明确，直接点明违规或限制。
                info 场景：平实告知，信息量控制在 1 个要点。

                一律禁止：「您好用户」「尊敬的」套话、列表、markdown。
                只输出播报正文，不要引号或前缀。""";
    }

    public int getAssistantMaxTokens() {
        try {
            return Math.min(Math.max(Integer.parseInt(get("llm.assistant.max_tokens", "120")), 32), 512);
        } catch (Exception e) {
            return 120;
        }
    }

    public double getAssistantTemperature() {
        try {
            double t = Double.parseDouble(get("llm.assistant.temperature", "0.7"));
            return Math.min(Math.max(t, 0), 1);
        } catch (Exception e) {
            return 0.7;
        }
    }

    /** 存档生成（持久画像）系统提示词。可通过 DB 配置 llm.assistant.prompt.archive 或环境变量覆盖。 */
    public String getAssistantArchivePrompt() {
        String fromDb = get("llm.assistant.prompt.archive", "");
        if (StringUtils.hasText(fromDb)) {
            return fromDb.trim();
        }
        return """
                你是实验室门禁AI助手。当前时间：{currentTime}（{dayOfWeek}，{timeOfDay}）。下面是用户 {name} 的持久性个人画像数据。

                数据分为两类：
                【持久数据 — 播报主体】已包含在下方数据包中，短期内稳定不变：
                - personnel: 身份信息（姓名、部门、课题组、用户类型、经验值）
                - rpgLevel: 经验等级（sqrt(总经验/50)+1，反映实验室投入程度）
                - groupContext: 课题组规模与近期活跃人数
                - recentActivity: 最近N天刷卡总次数、进入次数、最后刷卡时间、距今多少天
                - todayActivity: 今日活动记录（如无则为空）
                - behaviorPredictions: 历史行为模式（常去房间、驻留中位数分钟、高峰入场时段、超时概率）
                - activeViolations: 活跃违规记录（如有）
                - companions: 同行者（同房间±5分钟进入的人、同课题组近期活跃成员）

                【实时数据 — 点缀素材】播报时如有提供，自然融入一两处即可，不超过整段对话的 1/4 篇幅：
                - todayEntryRank（今天第 N 位入场）→ 可随口带过「今天来得挺早，第 N 个到的」
                - timeOfDay（早上/中午/下午/晚上）→ 结合时段问候，顺带关联行为习惯
                - daysSinceLastVisit（距上次多久）→ 有意义的间隔可提「有几天没见了」，但不要追问
                - activeInsideCount（当前馆内人数）→ 可感受式提及「今天馆里挺安静的」

                任务：为 {name} 生成 3～5 句个性化人物侧写式对话（80～150 字）。

                ## 核心原则
                说人话，像实验室同学碰面时的随口寒暄，不是客服广播也不是报表播报。
                从持久数据中挑 1～2 个最有辨识度的点展开，不必每条数据都覆盖。
                每次换一种结构——不要总是「课题组 + 经验等级 + 常去房间」三段式。
                实时数据是调料不是主菜——一两处自然带过即可，不要让整段话变成数据播报。

                ## 时间感知规则（最重要）
                - 用 currentContext 判断当前是早上/中午/下午/晚上
                - behaviorPredictions 的 peakEntryTime 是历史统计值。只提与当前时段相关的高峰：
                  - 当前时间在某个 peak 的 ±2 小时内 → 可以说「这个点你常来」
                  - 当前时间离所有 peak 都超过 3 小时 → 不提具体时间，可改用驻留时长或跳过时间维度
                  - 例：现在是下午4点半，peakEntryTime 是 "12:00, 10:00" → 不说「你通常上午10点来」（时间穿梭），改说「你一来就待将近三个小时」或直接不提时间

                ## 实时数据融合指南（有实时数据时参考）
                - 时段问候：根据 currentContext.timeOfDay 自然开场（早啊/中午好/晚上好），顺势关联持久画像中的高峰时段
                - 排名：todayEntryRank 有值时随口一提，不要机械地单独报数字，试试「今天你排第 N 个」「前面才 N 个人」等变体
                - 间隔：daysSinceLastVisit ≥ 3 时可提一嘴距上次多久，但要轻描淡写，不制造压力
                - 馆内人数：只在明显空或满时提（如 ≤3 人「馆里还没什么人」或接近容量「今天人挺多」）
                - 底线：实时数据最多占 1 句的篇幅，不要逐条罗列

                ## 信息取舍优先级（从高到低）
                1. 独特的行为特征：驻留特别长/短、经验等级突出、常去的房间有辨识度
                2. 课题组归属：自然地关联到团队，不机械
                3. 同伴线索：sameRoomNearby 或 sameGroupActive 有人名时才提，选一个不堆砌
                4. 实时点缀：时段、排名、间隔、人数中选 1 个最自然的
                5. 违规提醒：有才提，温和一笔带过
                6. 通用问候：以上都没素材时兜底

                ## 表达风格
                - 口语词可用：啊、啦、哦、嘛、呢、吧、对了、话说、看起来
                - 禁止「您」→ 用「你」
                - 禁止「亲爱的」「尊敬的」「用户」、markdown、列表
                - 每次开头换一种方式，不要总是「{name}，你是……」

                ## 违规处理
                - forbidEnter=true → 「上次有个记录还在处理中，暂时进不了门哦，稍等一下」
                - forbidEnter=false → 「之前有个小记录在处理，不影响进出」
                - 无违规 → 不提

                ## 同伴提及
                - sameRoomNearby 非空 → 「XXX差不多时间也刷卡进来了」
                - sameGroupActive 非空 → 「你们课题组的XXX最近也挺活跃」
                - 都有人时选一个提，都没有时跳过

                ## 低活动量
                - daysSinceLastVisit ≥ 14 → 「有段时间没见你来了」
                - daysSinceLastVisit ≥ 30 → 「好久没在实验室看到你了，最近在忙别的吗」
                - 不制造焦虑，不追问原因

                ## 绝对禁止
                - 「您好用户」「尊敬的」等客服套话
                - markdown、列表、编号
                - 编造不存在的人名、房间名、事件
                - 在当前时段提历史 peak 中明显矛盾的时间点
                - 每次输出结构雷同
                - 超过 150 字

                只输出对话正文，不含引号、前缀或署名。""";
    }

    /** welcome 场景 user 消息模板（留空则用内置） */
    public String getAssistantPromptWelcome() {
        return get("llm.assistant.prompt.welcome", "").trim();
    }

    /** alert 场景 user 消息模板 */
    public String getAssistantPromptAlert() {
        return get("llm.assistant.prompt.alert", "").trim();
    }

    /** info 场景 user 消息模板 */
    public String getAssistantPromptInfo() {
        return get("llm.assistant.prompt.info", "").trim();
    }

    /** 每日审计跑批后自动生成解读（无缓存时） */
    public boolean isAutoInsightAfterAudit() {
        return "true".equalsIgnoreCase(get("llm.auto_insight", "false"));
    }

    /** 打开某条清算详情时，若无缓存则自动生成一次 */
    public boolean isAutoInsightOnOpen() {
        return "true".equalsIgnoreCase(get("llm.auto_insight_on_open", "true"));
    }

    public int getAutoInsightBatchLimit() {
        try {
            return Math.min(Math.max(Integer.parseInt(get("llm.auto_insight_batch_limit", "5")), 1), 20);
        } catch (Exception e) {
            return 5;
        }
    }

    /** 预生成对话数据回溯天数（默认 30，范围 7-90）。也支持环境变量 PRE_GEN_DATA_WINDOW_DAYS */
    public int getPreGenDataWindowDays() {
        String env = System.getenv("PRE_GEN_DATA_WINDOW_DAYS");
        if (StringUtils.hasText(env)) {
            try { return Math.max(Integer.parseInt(env.trim()), 1); } catch (Exception ignored) {}
        }
        try {
            return Math.max(Integer.parseInt(get("llm.pre_gen.data_window_days", "30")), 1);
        } catch (Exception e) {
            return 30;
        }
    }

    public void assertReady() {
        if (!isEnabled()) {
            throw new IllegalStateException("大模型未启用，请在系统设置 → 大模型 中开启");
        }
        if (!StringUtils.hasText(getApiKey())) {
            throw new IllegalStateException("未配置 API Key，请在系统设置 → 大模型 中填写");
        }
    }

    /** 模块默认用户提问（系统设置可覆盖） */
    public String getInsightUserPrompt(String reportKey) {
        String key = LlmInsightModules.userPromptConfigKey(reportKey);
        String fromDb = get(key, "");
        if (StringUtils.hasText(fromDb)) {
            return fromDb.trim();
        }
        return LlmInsightModules.defaultUserPrompt(reportKey);
    }

    /** 模块系统提示（系统设置可覆盖；空则用内置 JSON 输出规范） */
    public String getInsightSystemPrompt(String reportKey) {
        String key = LlmInsightModules.systemPromptConfigKey(reportKey);
        String fromDb = get(key, "");
        if (StringUtils.hasText(fromDb)) {
            return fromDb.trim();
        }
        return LlmInsightModules.defaultSystemPrompt(reportKey);
    }

    public Map<String, Object> getInsightPromptBundle(String reportKey) {
        return LlmInsightModules.toPromptMap(
                reportKey, getInsightUserPrompt(reportKey), getInsightSystemPrompt(reportKey));
    }

    private void addModels(Set<String> target, String raw) {
        if (!StringUtils.hasText(raw)) {
            return;
        }
        for (String part : raw.split("[,;，；|\\s]+")) {
            String m = part.trim();
            if (StringUtils.hasText(m)) {
                target.add(m);
            }
        }
    }

    private String get(String key, String defaultValue) {
        List<SystemConfigItem> items = notificationSettingsService.listConfigs(MODULE);
        return items.stream()
                .filter(it -> key.equals(it.getConfigKey()))
                .map(SystemConfigItem::getConfigValue)
                .filter(StringUtils::hasText)
                .findFirst()
                .orElse(defaultValue);
    }

    private static String trimTrailingSlash(String url) {
        while (url.endsWith("/")) {
            url = url.substring(0, url.length() - 1);
        }
        return url;
    }

    /**
     * 标准化 Base URL：去除尾部斜杠后直接返回。
     * DeepSeek 官方 base 为 {@code https://api.deepseek.com}，客户端拼接 {@code /chat/completions} 即可。
     */
    static String normalizeOpenAiCompatibleBaseUrl(String url) {
        if (!StringUtils.hasText(url)) {
            return LlmProfilePresets.DEEPSEEK_BASE_URL;
        }
        return url;
    }
}
