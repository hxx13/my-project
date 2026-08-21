package com.example.demo.modules.twin.dashboard.service;

import com.example.demo.modules.twin.card.mapper.TwinCardMappingMapper;
import com.example.demo.modules.twin.card.service.TwinCardMappingService;
import com.example.demo.modules.twin.common.service.AroOccupancyAuthorityService;
import com.example.demo.modules.twin.common.service.TwinAutomationLogService;
import com.example.demo.modules.twin.dahua.service.DahuaAutoSignoutService;
import com.example.demo.modules.twin.dashboard.entity.TwinStudentViolation;
import com.example.demo.modules.twin.dashboard.entity.TwinViolationRule;
import com.example.demo.modules.twin.dashboard.mapper.StrandedViolationConfigMapper;
import com.example.demo.modules.twin.common.mapper.TwinDashboardMapper;
import com.example.demo.modules.twin.dashboard.support.ViolationTextTemplateRenderer;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import javax.annotation.PostConstruct;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/**
 * 每日定时检测：滞留未签退人员自动生成违规记录。
 *
 * <p>由 {@code JobExecutionRegistry} 在 {@code STRANDED_VIOLATION_CHECK}（一道·违规）或
 * {@code STRANDED_SIGNOUT_CHECK}（二道·仅签退）定时器触发。
 *
 * <p>流程（与冻结跑批 / AI 雷达滞留口径一致）：
 * <ol>
 *   <li>读取 {@code stranded_violation_config} (id=1)</li>
 *   <li>从 {@code aro_access_log} 取今日流水判定仍在馆的用户（与 {@link TwinCardMappingService#executeFreezeReaperTask} 同源）</li>
 *   <li>跳过 {@code twin_card_mapping} 中仍有效的免冻结豁免（{@link TwinCardMappingService#isFreezeExemptForPolicy}，以 DB 为准）</li>
 *   <li>通过 ARO {@code noLeaveRoom} 二次确认仍在内（官方权威；查询失败则跳过该用户）</li>
 *   <li>按部门白名单过滤</li>
 *   <li>去重：跳过已有 ACTIVE source='AUTO_STRANDED' 违规的用户；创建时 per-user MySQL 命名锁防并发重复</li>
 *   <li>可选自动签退</li>
 *   <li>创建违规记录</li>
 *   <li>更新配置行的执行结果</li>
 * </ol>
 */
@Service
public class StrandedViolationService {

    private static final Logger log = LoggerFactory.getLogger(StrandedViolationService.class);

    private final TwinCardMappingMapper mappingMapper;
    private final TwinCardMappingService cardMappingService;
    private final AroOccupancyAuthorityService occupancyAuthorityService;
    private final DahuaAutoSignoutService autoSignoutService;
    private final TwinStudentViolationService violationService;
    private final TwinDashboardMapper personnelMapper;
    private final StrandedViolationConfigMapper configMapper;
    private final TwinViolationRuleService ruleService;
    private final TwinAutomationLogService automationLogService;
    private final ObjectMapper objectMapper;

    public StrandedViolationService(
            TwinCardMappingMapper mappingMapper,
            TwinCardMappingService cardMappingService,
            AroOccupancyAuthorityService occupancyAuthorityService,
            DahuaAutoSignoutService autoSignoutService,
            TwinStudentViolationService violationService,
            TwinDashboardMapper personnelMapper,
            StrandedViolationConfigMapper configMapper,
            TwinViolationRuleService ruleService,
            TwinAutomationLogService automationLogService) {
        this.mappingMapper = mappingMapper;
        this.cardMappingService = cardMappingService;
        this.occupancyAuthorityService = occupancyAuthorityService;
        this.autoSignoutService = autoSignoutService;
        this.violationService = violationService;
        this.personnelMapper = personnelMapper;
        this.configMapper = configMapper;
        this.ruleService = ruleService;
        this.automationLogService = automationLogService;
        this.objectMapper = new ObjectMapper();
    }

    /**
     * T2-7：id=2 行的规范创建路径是 SQL bootstrap；此处仅作启动兜底
     *（旧库未跑过 bootstrap 时仍可自愈），与 TwinViolationSchemaMigrator 不再双写。
     */
    @PostConstruct
    public void ensureSignoutConfigRowOnStartup() {
        try {
            configMapper.ensureSignoutConfigRow();
        } catch (Exception e) {
            log.warn("[stranded-signout] 自动补全 config id=2 失败: {}", e.getMessage());
        }
    }

    /**
     * 由 {@code JobExecutionRegistry} 在 STRANDED_VIOLATION_CHECK 定时器触发时调用。
     */
    public void executeScheduledCheck() {
        // 1. 行为配置（公告文案/禁入/过期/拼图）始终从 stranded_violation_config 读取
        //    解禁管控字段（次数/窗口）从 twin_violation_rule 叠加
        Map<String, Object> config = configMapper.selectConfig();
        if (config == null || config.isEmpty()) {
            log.info("[stranded-violation] 配置行不存在，跳过");
            return;
        }
        boolean autoSignout = Boolean.TRUE.equals(toBool(config.get("auto_signout_enabled")));
        String tpl = Objects.toString(config.get("violation_text_tpl"), ViolationTextTemplateRenderer.DEFAULT_STRANDED_TPL);
        int forbidEnter = Boolean.TRUE.equals(toBool(config.get("forbid_enter"))) ? 1 : 0;
        int expireDays = toInt(config.get("expire_after_days"), 1);
        List<String> whitelistDepts = parseJsonArray(
                Objects.toString(config.get("whitelist_depts"), "[]"));
        boolean interactiveEnabled = Boolean.TRUE.equals(toBool(config.get("interactive_challenge_enabled")));
        String interactivePhrase = Objects.toString(config.get("interactive_challenge_phrase"), "");
        boolean interactiveUnlockOnVerify = toInt(config.get("interactive_unlock_on_verify"), 1) != 0;

        // 解禁管控字段从规则表读取（仅叠加，不替代行为配置）
        TwinViolationRule rule = ruleService.getByCode("AUTO_STRANDED");
        Long ruleId = (rule != null && (rule.getEnabled() == null || rule.getEnabled() == 1))
                ? rule.getId() : null;

        // 2. 今日流水判定仍在馆（与冻结跑批 / 雷达口径一致）
        Set<String> candidates = loadTodayStrandedCandidates();
        log.info("[stranded-violation] 今日流水滞留候选 {} 人", candidates.size());

        // 提前过滤豁免用户和白名单部门，避免后续 getNoLeaveRoom() 触发 ARO 侧批量清理时波及
        PreAroFilterStats preFilter = removeExemptAndWhitelistBeforeAro(candidates, whitelistDepts, "stranded-violation");
        int skippedExempt = preFilter.skippedExempt;
        int skippedWhitelistDept = preFilter.skippedWhitelistDept;

        int created = 0;
        int signedOut = 0;
        int skippedNotInside = 0;
        int skippedAroFailed = 0;
        List<String> errors = new ArrayList<>();

        for (String userId : candidates) {
            try {
                // 3. ARO 官方二次确认：是否仍在内
                AroOccupancyAuthorityService.OfficialPresence presence =
                        occupancyAuthorityService.queryOfficialPresence(userId);
                if (presence == AroOccupancyAuthorityService.OfficialPresence.QUERY_FAILED) {
                    skippedAroFailed++;
                    log.warn("[stranded-violation] ARO 查询失败，跳过 userId={}", userId);
                    errors.add("aro:" + userId);
                    automationLogService.write(
                            TwinAutomationLogService.TYPE_AUTO_SIGNOUT,
                            "STRANDED_ARO_QUERY_FAILED",
                            "TIMER",
                            "STRANDED_VIOLATION_CHECK",
                            userId,
                            null,
                            false,
                            "一道滞留检测：ARO 官方查询失败，无法判定是否在馆，已跳过",
                            "stranded-violation");
                    continue;
                }
                if (presence == AroOccupancyAuthorityService.OfficialPresence.NOT_INSIDE) {
                    skippedNotInside++;
                    automationLogService.write(
                            TwinAutomationLogService.TYPE_AUTO_SIGNOUT,
                            "STRANDED_ARO_CLEANUP",
                            "TIMER",
                            "STRANDED_VIOLATION_CHECK",
                            userId,
                            null,
                            true,
                            "一道滞留检测：ARO 官方侧已无滞留房间，视为已签退",
                            "stranded-violation");
                    continue;
                }

                // 5. 已有生效滞留违规则跳过（含签退与创建；并发时由 createAutoStrandedIfAbsent 二次兜底）
                if (violationService.hasActiveAutoViolation(userId)) {
                    log.info("[stranded-violation] 用户 {} 已有 ACTIVE AUTO_STRANDED 违规，跳过", userId);
                    continue;
                }

                // 7. 可选自动签退
                if (autoSignout) {
                    try {
                        autoSignoutService.autoSignout(
                                userId,
                                "STRANDED_VIOLATION",
                                "滞留未签退，定时任务自动签退",
                                "stranded_violation_check");
                        signedOut++;
                    } catch (Exception e) {
                        log.warn("[stranded-violation] autoSignout 失败 userId={}: {}", userId, e.getMessage());
                        errors.add("signout:" + userId);
                    }
                }

                // 8. 命名锁内去重并创建，避免并发重复插入
                String name = lookupName(userId);
                String dept = lookupDepartment(userId);
                String text = ViolationTextTemplateRenderer.render(
                        tpl, name, dept, ViolationTextTemplateRenderer.today());

                String challenge = interactiveEnabled && !interactivePhrase.isBlank() ? interactivePhrase.trim() : null;
                TwinStudentViolation newViolation = violationService.createAutoStrandedIfAbsent(
                        userId,
                        text,
                        null,  // no images
                        forbidEnter == 1,
                        null,  // maxEnterSuccess
                        true,  // showNoticeEveryScan
                        expireDays,
                        "SYSTEM",
                        challenge,
                        interactiveUnlockOnVerify,
                        ruleId);
                if (newViolation != null) {
                    created++;
                }

            } catch (Exception e) {
                log.warn("[stranded-violation] 处理失败 userId={}: {}", userId, e.getMessage());
                errors.add(userId);
            }
        }

        // 9. 写回执行结果
        String result = String.format(
                "候选%d人, 创建%d条违规, 签退%d人, 豁免跳过%d, 官方已离开%d, ARO失败%d, 失败%d人",
                candidates.size(), created, signedOut, skippedExempt, skippedNotInside, skippedAroFailed, errors.size());
        if (!errors.isEmpty()) {
            result += " 失败:" + String.join(",", errors);
        }
        configMapper.updateExecutionResult(LocalDateTime.now(), result);
        log.info("[stranded-violation] 执行完成: {}", result);
    }

    /**
     * 第二道定时：与 {@link #executeScheduledCheck()} 相同滞留口径，仅签退、不创建违规。
     * 签退开关读 {@code stranded_violation_config} id=2；部门白名单与一道共用 id=1。
     */
    public void executeScheduledSignoutCheck() {
        try {
            configMapper.ensureSignoutConfigRow();
        } catch (Exception e) {
            log.warn("[stranded-signout] 自动补全 config id=2 失败: {}", e.getMessage());
        }
        Map<String, Object> signoutCfg = configMapper.selectSignoutConfig();
        if (signoutCfg == null || signoutCfg.isEmpty()) {
            log.info("[stranded-signout] 配置行 id=2 不存在，跳过");
            return;
        }
        if (!Boolean.TRUE.equals(toBool(signoutCfg.get("auto_signout_enabled")))) {
            String offResult = "签退开关未开启，未执行";
            configMapper.updateSignoutExecutionResult(LocalDateTime.now(), offResult);
            log.info("[stranded-signout] {}", offResult);
            return;
        }

        Map<String, Object> primaryCfg = configMapper.selectConfig();
        List<String> whitelistDepts = primaryCfg == null || primaryCfg.isEmpty()
                ? List.of()
                : parseJsonArray(Objects.toString(primaryCfg.get("whitelist_depts"), "[]"));

        Set<String> candidates = loadTodayStrandedCandidates();
        log.info("[stranded-signout] 今日流水滞留候选 {} 人", candidates.size());

        // 提前过滤豁免用户和白名单部门，避免后续 getNoLeaveRoom() 触发 ARO 侧批量清理时波及
        PreAroFilterStats preFilter = removeExemptAndWhitelistBeforeAro(candidates, whitelistDepts, "stranded-signout");
        int skippedExempt = preFilter.skippedExempt;
        int skippedWhitelistDept = preFilter.skippedWhitelistDept;

        int signedOut = 0;
        int skippedNotInside = 0;
        int skippedAroFailed = 0;
        List<String> errors = new ArrayList<>();

        for (String userId : candidates) {
            try {
                AroOccupancyAuthorityService.OfficialPresence presence =
                        occupancyAuthorityService.queryOfficialPresence(userId);
                if (presence == AroOccupancyAuthorityService.OfficialPresence.QUERY_FAILED) {
                    skippedAroFailed++;
                    log.warn("[stranded-signout] ARO 查询失败，跳过 userId={}", userId);
                    errors.add("aro:" + userId);
                    automationLogService.write(
                            TwinAutomationLogService.TYPE_AUTO_SIGNOUT,
                            "STRANDED_ARO_QUERY_FAILED",
                            "TIMER",
                            "STRANDED_SIGNOUT_CHECK",
                            userId,
                            null,
                            false,
                            "二道滞留签退：ARO 官方查询失败，无法判定是否在馆，已跳过",
                            "stranded-signout");
                    continue;
                }
                if (presence == AroOccupancyAuthorityService.OfficialPresence.NOT_INSIDE) {
                    skippedNotInside++;
                    automationLogService.write(
                            TwinAutomationLogService.TYPE_AUTO_SIGNOUT,
                            "STRANDED_ARO_CLEANUP",
                            "TIMER",
                            "STRANDED_SIGNOUT_CHECK",
                            userId,
                            null,
                            true,
                            "二道滞留签退：ARO 官方侧已无滞留房间，视为已签退",
                            "stranded-signout");
                    continue;
                }

                autoSignoutService.autoSignout(
                        userId,
                        "STRANDED_VIOLATION",
                        "滞留未签退，第二道定时任务自动签退",
                        "stranded_signout_check");
                signedOut++;
            } catch (Exception e) {
                log.warn("[stranded-signout] 签退失败 userId={}: {}", userId, e.getMessage());
                errors.add("signout:" + userId);
            }
        }

        String result = String.format(
                "候选%d人, 签退%d人, 豁免跳过%d, 官方已离开%d, ARO失败%d, 失败%d人",
                candidates.size(), signedOut, skippedExempt, skippedNotInside, skippedAroFailed, errors.size());
        if (!errors.isEmpty()) {
            result += " 失败:" + String.join(",", errors);
        }
        configMapper.updateSignoutExecutionResult(LocalDateTime.now(), result);
        log.info("[stranded-signout] 执行完成: {}", result);
    }

    // ---- config helpers ----

    public Map<String, Object> getSignoutConfig() {
        try {
            configMapper.ensureSignoutConfigRow();
        } catch (Exception ignored) {
            // migrate 已尝试；读取仍可能为空
        }
        return configMapper.selectSignoutConfig();
    }

    @Transactional
    public void saveSignoutConfig(Map<String, Object> body) {
        int autoSignout = toTinyIntFlag(body.get("auto_signout_enabled"), 1);
        configMapper.updateSignoutOnlyConfig(autoSignout);
        log.info("[stranded-signout] config saved: autoSignout={}", autoSignout);
    }

    private Set<String> loadTodayStrandedCandidates() {
        String todayPrefix = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd")) + "%";
        List<String> strandedUserIds = mappingMapper.findTodayStrandedUserIds(todayPrefix);
        Set<String> candidates = new LinkedHashSet<>();
        if (strandedUserIds != null) {
            for (String uid : strandedUserIds) {
                if (uid != null && !uid.isBlank()) {
                    candidates.add(uid.trim());
                }
            }
        }
        return candidates;
    }

    // ---- config helpers (一道) ----

    public Map<String, Object> getConfig() {
        return configMapper.selectConfig();
    }

    @Transactional
    public void saveConfig(Map<String, Object> body) {
        String tpl = Objects.toString(body.get("violation_text_tpl"), "");
        if (tpl.isBlank()) tpl = ViolationTextTemplateRenderer.DEFAULT_STRANDED_TPL;

        String depts = Objects.toString(body.get("whitelist_depts"), "");
        if (depts.isBlank()) depts = "[]";

        String interactivePhrase = Objects.toString(body.get("interactive_challenge_phrase"), "");
        int interactiveEnabled = toInt(body.get("interactive_challenge_enabled"), 0);
        int interactiveUnlockOnVerify = toInt(body.get("interactive_unlock_on_verify"), 1);

        configMapper.updateConfig(
                toTinyIntFlag(body.get("auto_signout_enabled"), 1),
                tpl,
                toInt(body.get("forbid_enter"), 0),
                toInt(body.get("expire_after_days"), 1),
                depts,
                interactiveEnabled,
                interactivePhrase,
                interactiveUnlockOnVerify);
        log.info("[stranded-violation] config saved: autoSignout={}, tpl={}, forbidEnter={}, expireDays={}, interactive={}",
                toTinyIntFlag(body.get("auto_signout_enabled"), 1),
                tpl,
                toInt(body.get("forbid_enter"), 0),
                toInt(body.get("expire_after_days"), 1),
                interactiveEnabled);
    }

    /**
     * 对单个用户执行一次滞留检测（供管理端 POST /test 调用）。
     * C-T2：与定时一道共用「豁免 → 白名单 → ARO」顺序，且规则启用态与定时一致。
     *
     * @return 描述执行结果的摘要
     */
    public String testSingleUser(String userId, boolean autoSignout) {
        if (userId == null || userId.isBlank()) {
            return "缺少 userId";
        }

        // 行为配置始终从 stranded_violation_config 读取（公告文案/禁入/过期/拼图）
        Map<String, Object> config = configMapper.selectConfig();
        if (config == null || config.isEmpty()) {
            return "配置不存在";
        }
        String tpl = Objects.toString(config.get("violation_text_tpl"), ViolationTextTemplateRenderer.DEFAULT_STRANDED_TPL);
        int forbidEnter = Boolean.TRUE.equals(toBool(config.get("forbid_enter"))) ? 1 : 0;
        int expireDays = toInt(config.get("expire_after_days"), 1);
        List<String> whitelistDepts = parseJsonArray(
                Objects.toString(config.get("whitelist_depts"), "[]"));
        boolean interactiveEnabled = Boolean.TRUE.equals(toBool(config.get("interactive_challenge_enabled")));
        String interactivePhrase = Objects.toString(config.get("interactive_challenge_phrase"), "");
        boolean interactiveUnlockOnVerify = toInt(config.get("interactive_unlock_on_verify"), 1) != 0;

        // 解禁管控字段从规则表读取（仅叠加）；未启用规则不挂 ruleId，与定时一道一致
        TwinViolationRule testRule = ruleService.getByCode("AUTO_STRANDED");
        Long testRuleId = (testRule != null && (testRule.getEnabled() == null || testRule.getEnabled() == 1))
                ? testRule.getId() : null;

        // 本地流水是否仍判定在馆
        if (!occupancyAuthorityService.isLocallyStrandedToday(userId)) {
            return "该用户今日流水未判定为滞留，无需处理";
        }

        // 免冻结豁免（读 DB，与定时任务同源）——必须在 ARO 查询之前
        if (cardMappingService.isFreezeExemptForPolicy(userId)) {
            return "该用户仍享有免冻结豁免，跳过";
        }

        // 白名单——必须在 ARO 查询之前，避免触发上游副作用
        String dept = lookupDepartment(userId);
        if (!whitelistDepts.isEmpty() && whitelistDepts.contains(dept)) {
            return "该用户所属部门 " + dept + " 在白名单中，跳过";
        }

        // ARO 官方是否仍在内
        AroOccupancyAuthorityService.OfficialPresence presence =
                occupancyAuthorityService.queryOfficialPresence(userId);
        if (presence == AroOccupancyAuthorityService.OfficialPresence.QUERY_FAILED) {
            return "ARO 查询失败（网络或上游异常），无法判定";
        }
        if (presence == AroOccupancyAuthorityService.OfficialPresence.NOT_INSIDE) {
            return "该用户官方已无滞留房间，无需处理";
        }

        // 去重 + 创建（与定时任务同源：命名锁内判定）
        if (violationService.hasActiveAutoViolation(userId)) {
            return "该用户已有 ACTIVE 的 AUTO_STRANDED 违规，跳过（去重）";
        }

        StringBuilder sb = new StringBuilder();

        // 自动签退
        if (autoSignout) {
            try {
                autoSignoutService.autoSignout(
                        userId,
                        "STRANDED_VIOLATION",
                        "滞留未签退，手动测试触发",
                        "stranded_violation_test");
                sb.append("已执行自动签退; ");
            } catch (Exception e) {
                sb.append("自动签退失败: ").append(e.getMessage()).append("; ");
            }
        }

        // 创建违规
        String name = lookupName(userId);
        String text = ViolationTextTemplateRenderer.render(
                tpl, name, dept, ViolationTextTemplateRenderer.today());

        String challenge = interactiveEnabled && !interactivePhrase.isBlank() ? interactivePhrase.trim() : null;
        TwinStudentViolation newViolation = violationService.createAutoStrandedIfAbsent(
                userId, text, null, forbidEnter == 1, null, true,
                expireDays, "SYSTEM",
                challenge,
                interactiveUnlockOnVerify,
                testRuleId);

        if (newViolation == null) {
            return sb.append("该用户已有 ACTIVE 的 AUTO_STRANDED 违规，跳过（去重）").toString();
        }

        sb.append("已创建违规记录");
        return sb.toString();
    }

    // ---- internal helpers ----

    /**
     * C-T2：滞留候选在调用 ARO 前统一过滤豁免与部门白名单（一道/二道/手动测试共用顺序）。
     * 就地修改 {@code candidates}。
     */
    private PreAroFilterStats removeExemptAndWhitelistBeforeAro(
            Set<String> candidates, List<String> whitelistDepts, String logTag) {
        Set<String> exemptUserIds = new LinkedHashSet<>();
        Set<String> whitelistUserIds = new LinkedHashSet<>();
        for (String userId : candidates) {
            try {
                if (cardMappingService.isFreezeExemptForPolicy(userId)) {
                    exemptUserIds.add(userId);
                    continue;
                }
            } catch (Exception e) {
                log.warn("[{}] 豁免检查失败 userId={}: {}", logTag, userId, e.getMessage());
            }
            try {
                String dept = lookupDepartment(userId);
                if (!whitelistDepts.isEmpty() && whitelistDepts.contains(dept)) {
                    whitelistUserIds.add(userId);
                }
            } catch (Exception e) {
                log.warn("[{}] 部门查询失败 userId={}: {}", logTag, userId, e.getMessage());
            }
        }
        for (String uid : exemptUserIds) {
            log.info("[{}] 用户 {} 仍享有免冻结豁免(DB)，跳过", logTag, uid);
        }
        candidates.removeAll(exemptUserIds);
        candidates.removeAll(whitelistUserIds);
        return new PreAroFilterStats(exemptUserIds.size(), whitelistUserIds.size());
    }

    private record PreAroFilterStats(int skippedExempt, int skippedWhitelistDept) {
    }

    private String lookupDepartment(String userId) {
        try {
            List<Map<String, Object>> hits = personnelMapper.searchPersonnel(userId, 1);
            if (hits != null && !hits.isEmpty()) {
                return Objects.toString(hits.get(0).get("department_name"), "");
            }
        } catch (Exception ignored) {
        }
        return "";
    }

    private String lookupName(String userId) {
        try {
            List<Map<String, Object>> hits = personnelMapper.searchPersonnel(userId, 1);
            if (hits != null && !hits.isEmpty()) {
                return Objects.toString(hits.get(0).getOrDefault("name", userId), userId);
            }
        } catch (Exception ignored) {
        }
        return userId;
    }

    private List<String> parseJsonArray(String raw) {
        if (raw == null || raw.isBlank() || "[]".equals(raw)) {
            return List.of();
        }
        try {
            return objectMapper.readValue(raw, new TypeReference<>() {});
        } catch (Exception e) {
            log.warn("[stranded-violation] 解析 whitelist_depts 失败: {}", e.getMessage());
            return List.of();
        }
    }

    private static Boolean toBool(Object v) {
        if (v == null) {
            return false;
        }
        if (v instanceof Boolean b) {
            return b;
        }
        if (v instanceof Number n) {
            return n.intValue() == 1;
        }
        String s = String.valueOf(v);
        return "1".equals(s) || "true".equalsIgnoreCase(s);
    }

    private static int toInt(Object v, int def) {
        if (v == null) {
            return def;
        }
        if (v instanceof Number n) {
            return n.intValue();
        }
        if (v instanceof Boolean b) {
            return b ? 1 : 0;
        }
        try {
            return Integer.parseInt(String.valueOf(v));
        } catch (Exception e) {
            return def;
        }
    }

    /** TINYINT 开关：兼容 Boolean、0/1、\"true\"/\"false\" 字符串；null 时用 defaultWhenNull */
    private static int toTinyIntFlag(Object v, int defaultWhenNull) {
        if (v == null) {
            return defaultWhenNull;
        }
        if (v instanceof Boolean b) {
            return b ? 1 : 0;
        }
        if (v instanceof Number n) {
            return n.intValue() != 0 ? 1 : 0;
        }
        String s = String.valueOf(v).trim();
        if ("1".equals(s) || "true".equalsIgnoreCase(s)) {
            return 1;
        }
        if ("0".equals(s) || "false".equalsIgnoreCase(s)) {
            return 0;
        }
        try {
            return Integer.parseInt(s) != 0 ? 1 : 0;
        } catch (Exception e) {
            return defaultWhenNull;
        }
    }
}
