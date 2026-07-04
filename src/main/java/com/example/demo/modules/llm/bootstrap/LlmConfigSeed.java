package com.example.demo.modules.llm.bootstrap;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import com.example.demo.modules.llm.LlmInsightModules;
import com.example.demo.modules.llm.LlmProfilePresets;
import org.springframework.stereotype.Component;

import java.util.Map;

/**
 * 大模型（DeepSeek）连接参数：超级管理员在「系统设置 → 大模型」维护。
 * 默认使用 DeepSeek-V4-Pro，支持自定义 OpenAI 兼容协议的其他模型。
 */
@Component
@Order(125)
public class LlmConfigSeed implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(LlmConfigSeed.class);

    private static final String DEEPSEEK_MODEL_OPTIONS =
            "[\"deepseek-v4-pro\",\"deepseek-v4-flash\"]";

    private final JdbcTemplate jdbcTemplate;

    public LlmConfigSeed(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            ensureDef("llm", "llm.enabled", "启用大模型", "关闭后统计页无法生成 AI 解读", "BOOLEAN", null, "false", 0, 0, 0);
            ensureDef(
                    "llm",
                    "llm.provider",
                    "模型供应商",
                    "DeepSeek（默认）/ 自定义；切换后请保存并可用「一键切换」同步 Base URL 与模型",
                    "STRING",
                    "[\"deepseek\",\"custom\"]",
                    LlmProfilePresets.PROVIDER_DEEPSEEK,
                    0,
                    0,
                    0);
            ensureDef(
                    "llm",
                    "llm.api_key",
                    "API Key",
                    "填写 DeepSeek API Key（sk- 开头）。也可在服务器环境变量 DEEPSEEK_API_KEY 配置，仅后端调用",
                    "STRING",
                    null,
                    "",
                    1,
                    0,
                    0);
            ensureDef(
                    "llm",
                    "llm.base_url",
                    "API Base URL",
                    "DeepSeek 默认 https://api.deepseek.com，客户端自动拼接 /chat/completions",
                    "STRING",
                    null,
                    LlmProfilePresets.DEEPSEEK_BASE_URL,
                    0,
                    0,
                    0);
            ensureDef(
                    "llm",
                    "llm.model",
                    "主模型",
                    "优先使用；失败时按备用列表自动切换",
                    "STRING",
                    DEEPSEEK_MODEL_OPTIONS,
                    "deepseek-v4-pro",
                    0,
                    0,
                    0);
            ensureDef(
                    "llm",
                    "llm.model_fallback",
                    "备用模型列表",
                    "逗号分隔，主模型失败或限流时依次尝试。2～5 个即可",
                    "STRING",
                    null,
                    "deepseek-v4-flash",
                    0,
                    0,
                    0);
            ensureDef("llm", "llm.max_tokens", "最大输出 Token", "单次解读上限，建议 1024–4096", "NUMBER", null, "2048", 0, 0, 0);
            ensureDef("llm", "llm.temperature", "温度", "0–1，越低越稳定", "NUMBER", null, "0.3", 0, 0, 0);
            ensureDef(
                    "llm",
                    "llm.assistant.enabled",
                    "扫码助手 LLM 播报",
                    "开启后刷卡识别成功时由大模型生成欢迎语；关闭或失败时回退规则文案",
                    "BOOLEAN",
                    null,
                    "true",
                    0,
                    0,
                    0);
            ensureDef(
                    "llm",
                    "llm.assistant.max_tokens",
                    "扫码助手最大 Token",
                    "单次播报上限，建议 80–200",
                    "NUMBER",
                    null,
                    "120",
                    0,
                    0,
                    0);
            ensureDef(
                    "llm",
                    "llm.assistant.temperature",
                    "扫码助手温度",
                    "0–1，略高更自然",
                    "NUMBER",
                    null,
                    "0.7",
                    0,
                    0,
                    0);
            ensureDef(
                    "llm",
                    "llm.assistant.prompt.archive",
                    "存档生成 · 持久画像提示词",
                    "管理端/后台生成对话时的系统提示词；{name} 替换为用户姓名。留空使用内置 10 维持久画像规范",
                    "STRING",
                    null,
                    "",
                    0,
                    0,
                    0);
            ensureDef(
                    "llm",
                    "llm.auto_insight",
                    "每日审计后自动生成解读",
                    "在隔离服日/周/月清算完成后，为无缓存的记录调用大模型（约 1:30）",
                    "BOOLEAN",
                    null,
                    "true",
                    0,
                    0,
                    0);
            ensureDef(
                    "llm",
                    "llm.auto_insight_on_open",
                    "打开 AI 解读弹窗时自动生成",
                    "已关闭推荐：请在弹窗内编辑提问后手动点击「发送」。开启后无缓存时将自动调用大模型",
                    "BOOLEAN",
                    null,
                    "false",
                    0,
                    0,
                    0);
            ensureDef(
                    "llm",
                    "llm.auto_insight_batch_limit",
                    "批量/日批最多条数",
                    "单次最多处理几条清算记录，避免一次消耗过多 token",
                    "NUMBER",
                    null,
                    "5",
                    0,
                    0,
                    0);
            ensureDef(
                    "llm",
                    "llm.pre_gen.data_window_days",
                    "预生成数据回溯天数",
                    "预生成对话时拉取最近 N 天的访问记录、课题组活跃度等数据。默认 30 天，最低 1 天，不设上限",
                    "NUMBER",
                    null,
                    "30",
                    0,
                    0,
                    0);
            for (LlmInsightModules.ModuleMeta mod : LlmInsightModules.all()) {
                ensureDef(
                        "llm",
                        LlmInsightModules.userPromptConfigKey(mod.reportKey()),
                        "解读提问 · " + mod.labelZh(),
                        "各业务模块点击「AI 解读」时预填的用户提问；弹窗内可修改并保存到本机",
                        "STRING",
                        null,
                        mod.defaultUserPrompt(),
                        0,
                        0,
                        0);
                ensureDef(
                        "llm",
                        LlmInsightModules.systemPromptConfigKey(mod.reportKey()),
                        "解读系统提示 · " + mod.labelZh(),
                        "可选：覆盖大模型系统角色说明；留空则使用内置 JSON 输出规范",
                        "STRING",
                        null,
                        "",
                        0,
                        0,
                        0);
            }
            cleanupMisleadingPromptValues();
            seedArchivePromptDefault();
            migrateProviderDefaultIfMissing();
        } catch (Exception e) {
            log.warn("[llm] 配置定义初始化跳过: {}", e.getMessage());
        }
    }

    private String readConfigValue(String configKey) {
        return jdbcTemplate.query(
                """
                        SELECT config_value FROM sys_system_config
                        WHERE module = 'llm' AND config_key = ?
                        LIMIT 1
                        """,
                rs -> rs.next() ? rs.getString(1) : null,
                configKey);
    }

    private void upsertConfigValue(String configKey, String value) {
        Integer cnt = jdbcTemplate.queryForObject(
                """
                        SELECT COUNT(1) FROM sys_system_config
                        WHERE module = 'llm' AND config_key = ?
                        """,
                Integer.class,
                configKey);
        if (cnt != null && cnt > 0) {
            jdbcTemplate.update(
                    """
                            UPDATE sys_system_config
                            SET config_value = ?, update_time = NOW()
                            WHERE module = 'llm' AND config_key = ?
                            """,
                    value,
                    configKey);
        } else {
            jdbcTemplate.update(
                    """
                            INSERT INTO sys_system_config (module, config_key, config_value, update_time)
                            VALUES ('llm', ?, ?, NOW())
                            """,
                    configKey,
                    value);
        }
    }

    /** 首次升级：若 llm.provider 无值则按 base_url 推断并写入 */
    private void migrateProviderDefaultIfMissing() {
        try {
            Integer cnt = jdbcTemplate.queryForObject(
                    """
                            SELECT COUNT(1) FROM sys_system_config
                            WHERE module = 'llm' AND config_key = 'llm.provider'
                            """,
                    Integer.class);
            if (cnt != null && cnt > 0) {
                return;
            }
            String baseUrl = jdbcTemplate.query(
                    """
                            SELECT config_value FROM sys_system_config
                            WHERE module = 'llm' AND config_key = 'llm.base_url'
                            LIMIT 1
                            """,
                    rs -> rs.next() ? rs.getString(1) : null);
            String inferred = LlmProfilePresets.inferProviderFromBaseUrl(baseUrl);
            jdbcTemplate.update(
                    """
                            INSERT INTO sys_system_config (module, config_key, config_value, update_time)
                            VALUES ('llm', 'llm.provider', ?, NOW())
                            """,
                    inferred);
            log.info("[llm] 已推断并写入 llm.provider={}", inferred);
        } catch (Exception e) {
            log.debug("[llm] provider 迁移跳过: {}", e.getMessage());
        }
    }

    /** 首次启动时写入持久画像提示词默认值到 system_config；已有旧版则自动升级。UI 可见可编辑。 */
    private void seedArchivePromptDefault() {
        String key = "llm.assistant.prompt.archive";
        String existing = readConfigValue(key);
        // 旧版指纹检测（按版本演进叠加）
        boolean isV1 = existing != null && existing.contains("短期内不会变化的稳定信息");
        boolean isV2 = existing != null && existing.contains("数据字段说明") && !existing.contains("数据分为两类");

        if (existing == null || isV1 || isV2) {
            String defaultPrompt = """
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

            if (existing == null) {
                jdbcTemplate.update(
                        "INSERT INTO sys_system_config (module, config_key, config_value, update_time) VALUES ('llm', ?, ?, NOW())",
                        key, defaultPrompt);
                log.warn("[llm] 已写入持久画像提示词默认值 key={}", key);
            } else {
                String fromVer = isV1 ? "v1（短期内不会变化的稳定信息）" : "v2（数据字段说明）";
                jdbcTemplate.update(
                        "UPDATE sys_system_config SET config_value = ?, update_time = NOW() WHERE module = 'llm' AND config_key = ?",
                        defaultPrompt, key);
                log.warn("[llm] 已升级持久画像提示词 {} → v3（数据分为两类）key={}", fromVer, key);
            }
        }
    }

    /** 清理已废弃的配置项（定义 + 值） */
    private void cleanupMisleadingPromptValues() {
        String[] obsoleteKeys = {
            "llm.assistant.system_prompt",
            "llm.assistant.prompt.welcome",
            "llm.assistant.prompt.alert",
            "llm.assistant.prompt.info",
        };
        for (String key : obsoleteKeys) {
            try {
                jdbcTemplate.update("DELETE FROM sys_system_config WHERE module = 'llm' AND config_key = ?", key);
                jdbcTemplate.update("DELETE FROM sys_system_config_def WHERE module = 'llm' AND config_key = ?", key);
            } catch (Exception e) {
                log.debug("[llm] cleanup {} skipped: {}", key, e.getMessage());
            }
        }
    }

    private void ensureDef(
            String module,
            String configKey,
            String labelZh,
            String description,
            String valueType,
            String optionsJson,
            String defaultValue,
            int isSensitive,
            int requiresRestart,
            int isPublic) {
        Integer cnt = jdbcTemplate.queryForObject(
                "SELECT COUNT(1) FROM sys_system_config_def WHERE module = ? AND config_key = ?",
                Integer.class,
                module,
                configKey);
        if (cnt != null && cnt > 0) {
            jdbcTemplate.update(
                    """
                            UPDATE sys_system_config_def
                            SET label_zh = ?, description = ?, value_type = ?, options_json = COALESCE(?, options_json), default_value = ?
                            WHERE module = ? AND config_key = ?
                            """,
                    labelZh,
                    description,
                    valueType,
                    optionsJson,
                    defaultValue,
                    module,
                    configKey);
            return;
        }
        jdbcTemplate.update(
                """
                        INSERT INTO sys_system_config_def
                        (module, config_key, label_zh, description, value_type, options_json, default_value, is_sensitive, requires_restart, is_public, update_time)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
                        """,
                module,
                configKey,
                labelZh,
                description,
                valueType,
                optionsJson,
                defaultValue,
                isSensitive,
                requiresRestart,
                isPublic);
        log.info("[llm] 已插入配置定义: {}.{}", module, configKey);
    }
}
