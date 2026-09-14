package com.example.demo.modules.cageshelf.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.cageshelf.entity.CageStatusAlert;
import com.example.demo.modules.cageshelf.mapper.CageStatusAlertMapper;
import com.example.demo.modules.cageshelf.service.CageAlertConfigService;
import com.example.demo.modules.cageshelf.service.CageAlertRuleService;
import com.example.demo.modules.cageshelf.service.CageAlertViolationService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.util.StringUtils;
import com.example.demo.modules.cageshelf.scheduler.CageStatusAlertScheduler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import jakarta.servlet.http.HttpServletRequest;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 笼位特殊状态持续超时告警的读取端点（T5）。
 * 只读 cage_status_alert，只下发 state='ACTIVE'；不写违规、不碰老快照告警链路。
 */
@RestController
@RequestMapping("/api/cage-status-alert")
@Tag(name = "笼位状态告警")
public class CageStatusAlertController {

    private static final int MAX_CAGE_IDS = 2000;

    private final AuthContextService authContextService;
    private final CageStatusAlertMapper mapper;
    private final CageAlertConfigService configService;
    private final CageAlertViolationService violationService;
    private final CageStatusAlertScheduler alertScheduler;
    private final CageAlertRuleService ruleService;

    public CageStatusAlertController(AuthContextService authContextService,
                                     CageStatusAlertMapper mapper,
                                     CageAlertConfigService configService,
                                     CageAlertViolationService violationService,
                                     CageStatusAlertScheduler alertScheduler,
                                     CageAlertRuleService ruleService) {
        this.authContextService = authContextService;
        this.mapper = mapper;
        this.configService = configService;
        this.violationService = violationService;
        this.alertScheduler = alertScheduler;
        this.ruleService = ruleService;
    }

    /**
     * 配置改完立刻重算一轮 —— 否则要等引擎下一个 5 分钟 tick，用户盯着屏幕只会看到「关了没用」。
     * 必须在这里（服务方法返回之后）调：saveXxx 是 @Transactional，返回时事务**已提交**，
     * 引擎另一条连接才看得到新配置；放在事务内触发会读到旧配置、白跑一轮。
     */
    private void triggerRescan() {
        alertScheduler.scanSoon();
    }

    @GetMapping("/active")
    @Operation(summary = "活跃告警（不带 cageIds=全量须 STAFF；带 cageIds=指定笼位 MEMBER 即可）")
    public Result<List<CageStatusAlertView>> active(
            @RequestParam(required = false) String cageIds,
            HttpServletRequest request) {

        List<Long> ids = parseCageIds(cageIds);
        boolean scoped = !ids.isEmpty();

        // 鉴权分档：带 cageIds 的调用方只可能询问它已经在网格里看见的笼位 id，而网格本身已渲染这些
        // 笼位的状态色，所以不构成新的信息披露；反过来若要求 STAFF，刷卡弹窗的登录人（未必 STAFF）会永远
        // 拿不到告警。不带 cageIds 返回全量活跃告警（管理端笼架页左侧树徽标要全量，不能只给当前房间），必须 STAFF。
        Result<?> denied = requireMinRole(resolveUser(request.getHeader("Authorization")),
                scoped ? RoleEnum.MEMBER : RoleEnum.STAFF);
        if (denied != null) return Result.fail(403, denied.getMessage());

        if (ids.size() > MAX_CAGE_IDS) {
            return Result.fail(400, "cageIds 数量超过上限 " + MAX_CAGE_IDS);
        }

        List<CageStatusAlert> alerts = mapper.listActive(scoped ? ids : null);
        LocalDateTime now = LocalDateTime.now();
        // 阈值取**当前生效规则**，不用行里建行时的快照：改完阈值后，行若还没到撤销条件，
        // 展示的阈值也必须与设置中心一致 —— 否则界面读起来就是「我配的没生效」。
        Map<Long, List<CageAlertRuleService.EffectiveAlertRule>> rules = alerts.isEmpty() ? Map.of()
                : ruleService.resolveForCages(alerts.stream()
                        .map(CageStatusAlert::getAnimalCageId).distinct().toList());
        List<CageStatusAlertView> views = new ArrayList<>(alerts.size());
        for (CageStatusAlert a : alerts) {
            views.add(toView(a, now, currentThreshold(rules, a)));
        }
        return Result.success(views);
    }

    /** 当前生效阈值；解析不到（笼位已不在网格里 / 规则缺失）就回落到行里建行时的快照。 */
    private static Integer currentThreshold(Map<Long, List<CageAlertRuleService.EffectiveAlertRule>> rules,
                                            CageStatusAlert a) {
        List<CageAlertRuleService.EffectiveAlertRule> perCage = rules.get(a.getAnimalCageId());
        if (perCage != null) {
            for (CageAlertRuleService.EffectiveAlertRule r : perCage) {
                if (r.statusCode().equals(a.getStatusCode())) return r.thresholdDays();
            }
        }
        return a.getThresholdDays();
    }

    /**
     * 违规页「笼架提交」预填：状态 + 笼位 + PI/实验员 + 渲染好的违规文案 + 命中规则。
     * 只读，STAFF 即可；不命中 twin_violation_rule 时给保守兜底文案并 ruleMatched=false，绝不报错。
     */
    @GetMapping("/violation-prefill")
    @Operation(summary = "违规页「笼架提交」预填（STAFF）")
    public Result<Map<String, Object>> violationPrefill(@RequestParam Long animalCageId,
                                                        @RequestParam(required = false) String statusCode,
                                                        HttpServletRequest request) {
        Result<?> denied = requireMinRole(resolveUser(request.getHeader("Authorization")), RoleEnum.STAFF);
        if (denied != null) return Result.fail(403, denied.getMessage());
        try {
            return Result.success(violationService.prefill(animalCageId, statusCode));
        } catch (IllegalArgumentException e) {
            return Result.fail(400, e.getMessage());
        }
    }

    private CageStatusAlertView toView(CageStatusAlert a, LocalDateTime now, Integer thresholdDays) {
        String code = a.getStatusCode();
        long span = a.getStartedAt() == null ? 0 : Duration.between(a.getStartedAt(), now).toDays();
        return new CageStatusAlertView(
                a.getAnimalCageId() == null ? null : String.valueOf(a.getAnimalCageId()),
                code,
                ruleService.labelOf(code),
                a.getStartedAt(),
                a.getFiredAt(),
                thresholdDays,
                span,
                a.getAction(),
                a.getShelveId() == null ? null : String.valueOf(a.getShelveId()),
                a.getRoomId() == null ? null : String.valueOf(a.getRoomId()));
    }

    /** 逗号分隔的 animalCageId 列表；null/空白 → 空表（= 全量档）。非法 token 跳过（与 localGridBatch 同口径）。 */
    private static List<Long> parseCageIds(String raw) {
        if (raw == null || raw.isBlank()) return List.of();
        List<Long> out = new ArrayList<>();
        for (String token : raw.split(",")) {
            String t = token.trim();
            if (t.isEmpty()) continue;
            try {
                out.add(Long.parseLong(t));
            } catch (NumberFormatException ignore) {
                // 非法项忽略
            }
        }
        return out;
    }

    private User resolveUser(String authorization) {
        User user = authContextService.resolveUserFromBearer(authorization);
        if (user == null) return null;
        if (user.getRole() == null) user.setRole(RoleEnum.MEMBER);
        return user;
    }

    private Result<?> requireMinRole(User user, RoleEnum minRole) {
        if (user == null) return Result.error("未登录或Token无效");
        if (user.getStatus() != null && user.getStatus() == 0) return Result.error("账号已禁用");
        if (user.getRole().getLevel() < minRole.getLevel()) return Result.error("无权限访问");
        return null;
    }

    // ── 告警阈值配置（T6a）──

    @GetMapping("/config/global")
    @Operation(summary = "全局默认告警阈值（STAFF 可读）")
    public Result<List<Map<String, Object>>> globalConfig(HttpServletRequest request) {
        Result<?> denied = requireMinRole(resolveUser(request.getHeader("Authorization")), RoleEnum.STAFF);
        if (denied != null) return Result.fail(403, denied.getMessage());
        return Result.success(configService.globalView());
    }

    /** body: {@code { "rules": [ {statusCode, thresholdDays, action, enabled, startValue} x5 ] }}，全量替换五行。仅超管。 */
    @PutMapping("/config/global")
    @Operation(summary = "保存全局默认告警阈值（仅超管）")
    public Result<?> saveGlobalConfig(@RequestBody Map<String, Object> body, HttpServletRequest request) {
        Result<?> denied = requireMinRole(resolveUser(request.getHeader("Authorization")), RoleEnum.SUPER_ADMIN);
        if (denied != null) return Result.fail(403, denied.getMessage());
        try {
            configService.replaceGlobal(parseRules(body));
            triggerRescan();
            return Result.success(Map.of("ok", true));
        } catch (IllegalArgumentException e) {
            return Result.fail(400, e.getMessage());
        }
    }

    @GetMapping("/config/regions")
    @Operation(summary = "当前登录人能配告警阈值的区域树（超管=全量；组长=自己负责的子树+祖先定位链）")
    public Result<Map<String, Object>> regions(HttpServletRequest request) {
        User u = resolveUser(request.getHeader("Authorization"));
        if (u == null) return Result.fail(401, "未登录");
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("regions", configService.configurableRegions(u.getId(), isSuperAdmin(u)));
        return Result.success(out);
    }

    @GetMapping("/config/region")
    @Operation(summary = "读某区域的告警阈值配置")
    public Result<Map<String, Object>> regionConfig(@RequestParam String regionType,
                                                    @RequestParam String regionId,
                                                    HttpServletRequest request) {
        User u = resolveUser(request.getHeader("Authorization"));
        if (u == null) return Result.fail(401, "未登录");
        String denied = configService.manageRegionAlertError(u.getId(), isSuperAdmin(u), regionType, regionId);
        if (denied != null) return Result.fail(403, denied);
        return Result.success(configService.regionView(regionType, regionId, u.getId(), isSuperAdmin(u)));
    }

    /** body: {@code { regionType, regionId, rules: [ {statusCode, thresholdDays, action, enabled, startValue} x5 ] }}，全量替换。 */
    @PutMapping("/config/region")
    @Operation(summary = "保存某区域的告警阈值配置")
    public Result<?> saveRegionConfig(@RequestBody Map<String, Object> body, HttpServletRequest request) {
        User u = resolveUser(request.getHeader("Authorization"));
        if (u == null) return Result.fail(401, "未登录");
        String regionType = body == null || body.get("regionType") == null ? null : String.valueOf(body.get("regionType"));
        String regionId = body == null || body.get("regionId") == null ? null : String.valueOf(body.get("regionId"));
        if (!StringUtils.hasText(regionType) || !StringUtils.hasText(regionId)) {
            return Result.fail(400, "regionType 与 regionId 必填");
        }
        String denied = configService.manageRegionAlertError(u.getId(), isSuperAdmin(u), regionType, regionId);
        if (denied != null) return Result.fail(403, denied);
        try {
            configService.replaceRegion(regionType, regionId, parseRules(body), u.getId(), isSuperAdmin(u));
            triggerRescan();
            return Result.success(Map.of("ok", true));
        } catch (IllegalArgumentException e) {
            return Result.fail(400, e.getMessage());
        }
    }

    /** 从 body 里取 rules 数组，松散解析为 Rule 列表；字段缺失/非法的留给服务端校验报错（别在控制器里静默吞）。 */
    private List<CageAlertConfigService.Rule> parseRules(Map<String, Object> body) {
        List<CageAlertConfigService.Rule> out = new ArrayList<>();
        Object raw = body == null ? null : body.get("rules");
        if (!(raw instanceof List<?> list)) return out;
        for (Object o : list) {
            if (!(o instanceof Map<?, ?> m)) continue;
            out.add(new CageAlertConfigService.Rule(
                    str(m.get("statusCode")),
                    asInt(m.get("thresholdDays")),
                    str(m.get("action")),
                    asBool(m.get("enabled")),
                    asInt(m.get("startValue"))));
        }
        return out;
    }

    private static Integer asInt(Object v) {
        if (v == null) return null;
        if (v instanceof Number n) return n.intValue();
        String s = String.valueOf(v).trim();
        if (s.isEmpty()) return null;
        try {
            return Integer.parseInt(s);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static Boolean asBool(Object v) {
        if (v == null) return null;
        if (v instanceof Boolean b) return b;
        String s = String.valueOf(v).trim();
        if ("1".equals(s) || "true".equalsIgnoreCase(s)) return true;
        if ("0".equals(s) || "false".equalsIgnoreCase(s)) return false;
        return null;
    }

    private static boolean isSuperAdmin(User u) {
        return u != null && u.getRole() != null && u.getRole().getLevel() >= RoleEnum.SUPER_ADMIN.getLevel();
    }

    private static String str(Object v) {
        return v == null ? null : String.valueOf(v).trim();
    }

    /** animalCageId/shelveId/roomId 均以字符串返回：雪花 ID 超出 JS Number 精度，与本地网格同源对齐。 */
    public record CageStatusAlertView(
            String animalCageId,
            String statusCode,
            String statusLabel,
            LocalDateTime startedAt,
            LocalDateTime firedAt,
            Integer thresholdDays,
            long spanDays,
            String action,
            String shelveId,
            String roomId) {
    }
}
