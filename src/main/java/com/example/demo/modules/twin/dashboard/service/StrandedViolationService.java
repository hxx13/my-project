package com.example.demo.modules.twin.dashboard.service;

import com.example.demo.modules.twin.dahua.mapper.DahuaSwingMapper;
import com.example.demo.modules.twin.dahua.service.DahuaAutoSignoutService;
import com.example.demo.modules.twin.dashboard.mapper.StrandedViolationConfigMapper;
import com.example.demo.modules.twin.common.mapper.TwinDashboardMapper;
import com.example.demo.modules.aro.service.AroService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * 每日定时检测：滞留未签退人员自动生成违规记录。
 *
 * <p>由 {@code JobExecutionRegistry} 在 {@code STRANDED_VIOLATION_CHECK} 定时器触发时调用
 * {@link #executeScheduledCheck()}。
 *
 * <p>流程：
 * <ol>
 *   <li>读取 {@code stranded_violation_config} (id=1)，若 disabled 则跳过</li>
 *   <li>查询 {@code dahua_activation_state} 中 state='ACTIVATED' 的用户</li>
 *   <li>通过 ARO {@code noLeaveRoom} 二次确认仍在内</li>
 *   <li>按部门白名单过滤</li>
 *   <li>去重：跳过已有 ACTIVE source='AUTO_STRANDED' 违规的用户</li>
 *   <li>可选自动签退</li>
 *   <li>创建违规记录</li>
 *   <li>更新配置行的执行结果</li>
 * </ol>
 */
@Service
public class StrandedViolationService {

    private static final Logger log = LoggerFactory.getLogger(StrandedViolationService.class);

    private static final String SOURCE_AUTO_STRANDED = "AUTO_STRANDED";
    private static final String DEFAULT_VIOLATION_TPL =
            "${name}(${dept})滞留未签退，系统自动登记";

    private final DahuaSwingMapper dahuaSwingMapper;
    private final AroService aroService;
    private final DahuaAutoSignoutService autoSignoutService;
    private final TwinStudentViolationService violationService;
    private final TwinDashboardMapper personnelMapper;
    private final StrandedViolationConfigMapper configMapper;
    private final ObjectMapper objectMapper;

    public StrandedViolationService(
            DahuaSwingMapper dahuaSwingMapper,
            AroService aroService,
            DahuaAutoSignoutService autoSignoutService,
            TwinStudentViolationService violationService,
            TwinDashboardMapper personnelMapper,
            StrandedViolationConfigMapper configMapper) {
        this.dahuaSwingMapper = dahuaSwingMapper;
        this.aroService = aroService;
        this.autoSignoutService = autoSignoutService;
        this.violationService = violationService;
        this.personnelMapper = personnelMapper;
        this.configMapper = configMapper;
        this.objectMapper = new ObjectMapper();
    }

    /**
     * 由 {@code JobExecutionRegistry} 在 STRANDED_VIOLATION_CHECK 定时器触发时调用。
     */
    public void executeScheduledCheck() {
        // 1. 读取配置
        Map<String, Object> config = configMapper.selectConfig();
        if (config == null || config.isEmpty()) {
            log.info("[stranded-violation] 配置行不存在，跳过");
            return;
        }
        if (!Boolean.TRUE.equals(toBool(config.get("enabled")))) {
            log.info("[stranded-violation] disabled，跳过");
            return;
        }

        boolean autoSignout = Boolean.TRUE.equals(toBool(config.get("auto_signout_enabled")));
        String tpl = Objects.toString(config.get("violation_text_tpl"), DEFAULT_VIOLATION_TPL);
        int forbidEnter = Boolean.TRUE.equals(toBool(config.get("forbid_enter"))) ? 1 : 0;
        int expireDays = toInt(config.get("expire_after_days"), 1);
        List<String> whitelistDepts = parseJsonArray(
                Objects.toString(config.get("whitelist_depts"), "[]"));

        // 2. 查询当前 ACTIVATED 用户
        List<Map<String, Object>> activatedUsers = dahuaSwingMapper.listActivatedUsers();
        log.info("[stranded-violation] 发现 {} 名 ACTIVATED 用户", activatedUsers.size());

        int created = 0;
        int signedOut = 0;
        List<String> errors = new ArrayList<>();

        for (Map<String, Object> user : activatedUsers) {
            String userId = Objects.toString(user.get("user_id"), "");
            if (userId.isBlank()) {
                continue;
            }

            try {
                // 3. ARO 二次确认：是否仍在内
                List<?> noLeaveRooms = aroService.getNoLeaveRoom(userId);
                if (noLeaveRooms == null || noLeaveRooms.isEmpty()) {
                    // 官方已无滞留，跳过
                    continue;
                }

                // 4. 部门白名单过滤
                String dept = lookupDepartment(userId);
                if (!whitelistDepts.isEmpty() && whitelistDepts.contains(dept)) {
                    log.debug("[stranded-violation] 用户 {} 在白名单部门 {}，跳过", userId, dept);
                    continue;
                }

                // 5. 去重：是否已有 ACTIVE 的 AUTO_STRANDED 违规
                if (violationService.hasActiveAutoViolation(userId)) {
                    continue;
                }

                // 6. 可选自动签退
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

                // 7. 创建违规记录
                String name = Objects.toString(user.getOrDefault("name", userId), userId);
                String text = tpl
                        .replace("${name}", name)
                        .replace("${dept}", dept)
                        .replace("${date}",
                                LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd")));

                violationService.create(
                        userId,
                        text,
                        null,  // no images
                        forbidEnter == 1,
                        null,  // maxEnterSuccess
                        true,  // showNoticeEveryScan
                        expireDays,
                        "SYSTEM",
                        SOURCE_AUTO_STRANDED);
                created++;

            } catch (Exception e) {
                log.warn("[stranded-violation] 处理失败 userId={}: {}", userId, e.getMessage());
                errors.add(userId);
            }
        }

        // 8. 写回执行结果
        String result = String.format("创建%d条违规, 签退%d人, 失败%d人",
                created, signedOut, errors.size());
        if (!errors.isEmpty()) {
            result += " 失败:" + String.join(",", errors);
        }
        configMapper.updateExecutionResult(LocalDateTime.now(), result);
        log.info("[stranded-violation] 执行完成: {}", result);
    }

    // ---- config helpers ----

    public Map<String, Object> getConfig() {
        return configMapper.selectConfig();
    }

    public void saveConfig(Map<String, Object> body) {
        configMapper.updateConfig(
                toInt(body.get("enabled"), 0),
                toInt(body.get("auto_signout_enabled"), 1),
                Objects.toString(body.get("violation_text_tpl"), DEFAULT_VIOLATION_TPL),
                toInt(body.get("forbid_enter"), 0),
                toInt(body.get("expire_after_days"), 1),
                Objects.toString(body.get("whitelist_depts"), "[]"));
    }

    /**
     * 对单个用户执行一次滞留检测（供管理端 POST /test 调用）。
     *
     * @return 描述执行结果的摘要
     */
    public String testSingleUser(String userId, boolean autoSignout) {
        if (userId == null || userId.isBlank()) {
            return "缺少 userId";
        }

        Map<String, Object> config = configMapper.selectConfig();
        if (config == null || config.isEmpty()) {
            return "配置不存在";
        }
        // NOTE: for testing, we allow execution even if master enabled=false
        // (so admins can verify config before enabling globally)
        String tpl = Objects.toString(config.get("violation_text_tpl"), DEFAULT_VIOLATION_TPL);
        int forbidEnter = Boolean.TRUE.equals(toBool(config.get("forbid_enter"))) ? 1 : 0;
        int expireDays = toInt(config.get("expire_after_days"), 1);
        List<String> whitelistDepts = parseJsonArray(
                Objects.toString(config.get("whitelist_depts"), "[]"));

        // 检查 ARO 是否仍在内
        List<?> noLeaveRooms = aroService.getNoLeaveRoom(userId);
        if (noLeaveRooms == null) {
            return "ARO 查询失败（网络或上游异常），无法判定";
        }
        if (noLeaveRooms.isEmpty()) {
            return "该用户官方已无滞留房间，无需处理";
        }

        // 白名单
        String dept = lookupDepartment(userId);
        if (!whitelistDepts.isEmpty() && whitelistDepts.contains(dept)) {
            return "该用户所属部门 " + dept + " 在白名单中，跳过";
        }

        // 去重
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
        String name = userId; // 从人员库查
        try {
            List<Map<String, Object>> hits = personnelMapper.searchPersonnel(userId, 1);
            if (hits != null && !hits.isEmpty()) {
                name = Objects.toString(hits.get(0).getOrDefault("name", userId), userId);
            }
        } catch (Exception ignored) {
        }

        String text = tpl
                .replace("${name}", name)
                .replace("${dept}", dept)
                .replace("${date}",
                        LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd")));

        violationService.create(
                userId, text, null, forbidEnter == 1, null, true,
                expireDays, "SYSTEM", SOURCE_AUTO_STRANDED);

        sb.append("已创建违规记录");
        return sb.toString();
    }

    // ---- internal helpers ----

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
}
