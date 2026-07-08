package com.example.demo.modules.twin.dashboard.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.auth.service.UserDisplayNameService;
import com.example.demo.modules.twin.dashboard.dto.UnboundCardNoticeSettingsDTO;
import com.example.demo.modules.twin.dashboard.entity.TwinStudentViolation;
import com.example.demo.modules.twin.dashboard.entity.TwinViolationRule;
import com.example.demo.modules.twin.dashboard.mapper.TwinStudentViolationMapper;
import com.example.demo.modules.twin.common.service.TwinPersonnelArchiveQueryService;
import com.example.demo.modules.twin.dashboard.entity.ViolationTextTemplate;
import com.example.demo.modules.twin.dashboard.service.StrandedViolationService;
import com.example.demo.modules.twin.dashboard.service.TwinStudentViolationNoticeConfigService;
import com.example.demo.modules.twin.dashboard.service.TwinStudentViolationService;
import com.example.demo.modules.twin.dashboard.service.TwinViolationRuleService;
import com.example.demo.modules.twin.dashboard.service.ViolationTextTemplateService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.Data;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/admin/twin/student-violations")
@Tag(name = "Twin-Student-Violation", description = "学生违规管理（管理员绑定人员、通告与进房限制）")
public class AdminTwinStudentViolationController {

    private final TwinStudentViolationService violationService;
    private final TwinStudentViolationNoticeConfigService unboundNoticeConfigService;
    private final TwinPersonnelArchiveQueryService personnelArchiveQueryService;
    private final AuthContextService authContextService;
    private final UserDisplayNameService userDisplayNameService;
    private final StrandedViolationService strandedViolationService;
    private final ViolationTextTemplateService templateService;
    private final TwinViolationRuleService ruleService;
    private final TwinStudentViolationMapper violationMapper;

    public AdminTwinStudentViolationController(
            TwinStudentViolationService violationService,
            TwinStudentViolationNoticeConfigService unboundNoticeConfigService,
            TwinPersonnelArchiveQueryService personnelArchiveQueryService,
            AuthContextService authContextService,
            UserDisplayNameService userDisplayNameService,
            StrandedViolationService strandedViolationService,
            ViolationTextTemplateService templateService,
            TwinViolationRuleService ruleService,
            TwinStudentViolationMapper violationMapper
    ) {
        this.violationService = violationService;
        this.unboundNoticeConfigService = unboundNoticeConfigService;
        this.personnelArchiveQueryService = personnelArchiveQueryService;
        this.authContextService = authContextService;
        this.userDisplayNameService = userDisplayNameService;
        this.strandedViolationService = strandedViolationService;
        this.templateService = templateService;
        this.ruleService = ruleService;
        this.violationMapper = violationMapper;
    }

    @GetMapping("/unbound-notice-settings")
    @Operation(summary = "未绑卡扫码提示全局配置")
    public Result<?> getUnboundNoticeSettings(
            @RequestHeader(value = "Authorization", required = false) String authorization
    ) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) {
            return denied;
        }
        return Result.success(unboundNoticeConfigService.getSettings());
    }

    @PutMapping("/unbound-notice-settings")
    @Operation(summary = "保存未绑卡扫码提示全局配置")
    public Result<?> saveUnboundNoticeSettings(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestBody UnboundCardNoticeSettingsDTO body
    ) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) {
            return denied;
        }
        User admin = authContextService.resolveUserFromBearer(authorization);
        unboundNoticeConfigService.saveSettings(body, admin == null ? null : admin.getId());
        return Result.success(unboundNoticeConfigService.getSettings());
    }

    @GetMapping
    @Operation(summary = "违规记录列表（含历史；扫码弹窗仅取每人最新一条 ACTIVE）")
    public Result<?> list(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestParam(value = "targetUserId", required = false) String targetUserId,
            @RequestParam(value = "limit", defaultValue = "100") int limit
    ) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) {
            return denied;
        }
        int lim = Math.min(Math.max(limit, 1), 500);
        List<TwinStudentViolation> rows = violationService.listRecent(targetUserId, lim);
        Set<String> idSet = new HashSet<>();
        for (TwinStudentViolation v : rows) {
            if (v != null && StringUtils.hasText(v.getTargetUserId())) {
                idSet.add(v.getTargetUserId().trim());
            }
        }
        Map<String, String> displayNames = userDisplayNameService.resolveDisplayNames(idSet);
        List<Map<String, Object>> out = rows.stream().map(v -> toRow(v, displayNames)).collect(Collectors.toList());
        return Result.success(out);
    }

    @PutMapping("/{id}")
    @Operation(summary = "编辑违规记录（不改人员与状态；到期：expireMode=KEEP|CLEAR|RELATIVE，RELATIVE 配合 expireAfterDays>0）")
    public Result<?> update(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable("id") long id,
            @RequestBody UpdateStudentViolationBody body
    ) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) {
            return denied;
        }
        if (body == null) {
            return Result.error("缺少请求体");
        }
        Integer maxEnter = body.getMaxEnterSuccess();
        if (maxEnter != null && maxEnter < 0) {
            return Result.error("进入次数上限不能为负数");
        }
        try {
            TwinStudentViolation row = violationService.update(
                    id,
                    body.getViolationText() != null ? body.getViolationText() : "",
                    body.getImageUrls(),
                    Boolean.TRUE.equals(body.getForbidEnter()),
                    maxEnter,
                    body.getShowNoticeEveryScan() == null || Boolean.TRUE.equals(body.getShowNoticeEveryScan()),
                    body.getExpireMode(),
                    body.getExpireAfterDays(),
                    body.getInteractiveChallenge(),
                    body.getInteractiveUnlockOnVerify()
            );
            return Result.success(toRow(row, null));
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        } catch (Exception e) {
            return Result.error("更新失败: " + readableError(e));
        }
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "删除违规记录（物理删除，请谨慎）")
    public Result<?> delete(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable("id") long id
    ) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) {
            return denied;
        }
        boolean ok = violationService.delete(id);
        return ok ? Result.success() : Result.error("记录不存在");
    }

    @GetMapping("/personnel/project-groups/search")
    @Operation(summary = "检索课题组名（人员档案库 aro_personnel，拆分逗号分隔）")
    public Result<?> searchProjectGroups(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestParam("keyword") String keyword,
            @RequestParam(value = "limit", defaultValue = "30") int limit
    ) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) {
            return denied;
        }
        return Result.success(personnelArchiveQueryService.searchProjectGroupNames(keyword, limit));
    }

    @GetMapping("/personnel/by-project-group")
    @Operation(summary = "列出某课题组下的人员（档案库，精确匹配拆分后的课题组 token）")
    public Result<?> listPersonnelByProjectGroup(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestParam("projectGroupName") String projectGroupName,
            @RequestParam(value = "limit", defaultValue = "500") int limit
    ) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) {
            return denied;
        }
        if (!StringUtils.hasText(projectGroupName)) {
            return Result.error("缺少 projectGroupName");
        }
        return Result.success(personnelArchiveQueryService.listMembersByProjectGroup(projectGroupName, limit));
    }

    @PostMapping("/batch")
    @Operation(summary = "批量新建违规记录（每人一条；单次最多 200 人）")
    public Result<?> createBatch(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestBody BatchCreateStudentViolationBody body
    ) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) {
            return denied;
        }
        User admin = authContextService.resolveUserFromBearer(authorization);
        if (admin == null) {
            return Result.error("未登录或令牌无效");
        }
        if (body == null || body.getTargetUserIds() == null || body.getTargetUserIds().isEmpty()) {
            return Result.error("缺少 targetUserIds");
        }
        Integer maxEnter = body.getMaxEnterSuccess();
        if (maxEnter != null && maxEnter < 0) {
            return Result.error("进入次数上限不能为负数");
        }
        try {
            Long effectiveRuleId = body.getRuleId();
            if (effectiveRuleId == null && ruleService != null) {
                TwinViolationRule manualRule = ruleService.getByCode("MANUAL");
                if (manualRule != null) effectiveRuleId = manualRule.getId();
            }
            Map<String, Object> summary = violationService.createBatch(
                    body.getTargetUserIds(),
                    body.getViolationText() != null ? body.getViolationText() : "",
                    body.getImageUrls(),
                    Boolean.TRUE.equals(body.getForbidEnter()),
                    maxEnter,
                    body.getShowNoticeEveryScan() == null || Boolean.TRUE.equals(body.getShowNoticeEveryScan()),
                    body.getExpireAfterDays(),
                    admin.getId(),
                    body.getInteractiveChallenge(),
                    body.getInteractiveUnlockOnVerify(),
                    effectiveRuleId
            );
            return Result.success(summary);
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        } catch (Exception e) {
            return Result.error("批量创建失败: " + readableError(e));
        }
    }

    @PostMapping
    @Operation(summary = "新建违规记录（同一人已有 ACTIVE 会先标为 SUPERSEDED 并完整保留；扫码仅展示最新 ACTIVE）")
    public Result<?> create(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestBody CreateStudentViolationBody body
    ) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) {
            return denied;
        }
        User admin = authContextService.resolveUserFromBearer(authorization);
        if (admin == null) {
            return Result.error("未登录或令牌无效");
        }
        if (body == null || !StringUtils.hasText(body.getTargetUserId())) {
            return Result.error("缺少 targetUserId");
        }
        Integer maxEnter = body.getMaxEnterSuccess();
        if (maxEnter != null && maxEnter < 0) {
            return Result.error("进入次数上限不能为负数");
        }
        try {
            Long effectiveRuleId = body.getRuleId();
            if (effectiveRuleId == null && ruleService != null) {
                TwinViolationRule manualRule = ruleService.getByCode("MANUAL");
                if (manualRule != null) effectiveRuleId = manualRule.getId();
            }
            TwinStudentViolation row = violationService.create(
                    body.getTargetUserId().trim(),
                    body.getViolationText() != null ? body.getViolationText() : "",
                    body.getImageUrls(),
                    Boolean.TRUE.equals(body.getForbidEnter()),
                    maxEnter,
                    body.getShowNoticeEveryScan() == null || Boolean.TRUE.equals(body.getShowNoticeEveryScan()),
                    body.getExpireAfterDays(),
                    admin.getId(),
                    "MANUAL",
                    body.getInteractiveChallenge(),
                    body.getInteractiveUnlockOnVerify(),
                    effectiveRuleId
            );
            if (body.getCageViolationId() != null) {
                violationMapper.setCageViolationId(row.getId(), body.getCageViolationId());
            }
            return Result.success(toRow(row, null));
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        } catch (Exception e) {
            return Result.error("创建失败: " + readableError(e));
        }
    }

    @PostMapping("/{id}/clear")
    @Operation(summary = "解除当前违规（CLEARED）")
    public Result<?> clear(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable("id") long id
    ) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) {
            return denied;
        }
        User admin = authContextService.resolveUserFromBearer(authorization);
        if (admin == null) {
            return Result.error("未登录或令牌无效");
        }
        boolean ok = violationService.clear(id, admin.getId());
        return ok ? Result.success() : Result.error("记录不存在或已非生效状态");
    }

    @PostMapping("/{id}/mark-processed")
    @Operation(summary = "标记违规已处理（PROCESSED，扫码弹窗不再展示，记录仍保留）")
    public Result<?> markProcessed(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable("id") long id
    ) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) {
            return denied;
        }
        User admin = authContextService.resolveUserFromBearer(authorization);
        if (admin == null) {
            return Result.error("未登录或令牌无效");
        }
        boolean ok = violationService.markProcessed(id, admin.getId());
        return ok ? Result.success() : Result.error("记录不存在或已非生效状态");
    }

    private Map<String, Object> toRow(TwinStudentViolation v, Map<String, String> displayNameCache) {
        Map<String, Object> m = new HashMap<>();
        m.put("id", v.getId());
        m.put("targetUserId", v.getTargetUserId());
        String tid = StringUtils.hasText(v.getTargetUserId()) ? v.getTargetUserId().trim() : "";
        String displayName;
        if (displayNameCache != null && StringUtils.hasText(tid) && displayNameCache.containsKey(tid)) {
            displayName = displayNameCache.get(tid);
        } else {
            displayName = userDisplayNameService.resolveDisplayName(tid);
        }
        m.put("targetUserDisplayName", displayName);
        m.put("violationText", v.getViolationText());
        m.put("imageUrls", v.getImageUrls());
        m.put("forbidEnter", v.getForbidEnter());
        m.put("enterLocked", violationService.isEnterLocked(v));
        m.put("maxEnterSuccess", v.getMaxEnterSuccess());
        m.put("enterSuccessCount", v.getEnterSuccessCount());
        m.put("showNoticeEveryScan", v.getShowNoticeEveryScan());
        m.put("expireAt", v.getExpireAt());
        m.put("status", v.getStatus());
        m.put("source", v.getSource());
        m.put("createdByUserId", v.getCreatedByUserId());
        m.put("createdAt", v.getCreatedAt());
        m.put("updatedAt", v.getUpdatedAt());
        m.put("clearedAt", v.getClearedAt());
        m.put("clearedByUserId", v.getClearedByUserId());
        m.put("interactiveChallenge", v.getInteractiveChallenge());
        m.put("interactiveChallengeVerifiedAt", v.getInteractiveChallengeVerifiedAt());
        m.put("interactiveUnlockOnVerify", v.getInteractiveUnlockOnVerify());
        m.put("ruleId", v.getRuleId());
        if (v.getRuleId() != null && ruleService != null) {
            TwinViolationRule rule = ruleService.getById(v.getRuleId());
            m.put("ruleName", rule != null ? rule.getRuleName() : null);
        } else {
            m.put("ruleName", null);
        }
        return m;
    }

    private Result<?> requireAdmin(String authorization) {
        User user = authContextService.resolveUserFromBearer(authorization);
        if (user == null) {
            return Result.error("未登录或令牌无效");
        }
        if (user.getStatus() != null && user.getStatus() == 0) {
            return Result.error("账号已禁用");
        }
        RoleEnum role = user.getRole() != null ? user.getRole() : RoleEnum.MEMBER;
        if (role.getLevel() < RoleEnum.ADMIN.getLevel()) {
            return Result.error("无权限访问（需管理员及以上）");
        }
        return null;
    }

    private static Boolean toBool(Object v) {
        if (v == null) return false;
        if (v instanceof Boolean b) return b;
        if (v instanceof Number n) return n.intValue() != 0;
        String s = String.valueOf(v);
        return "1".equals(s) || "true".equalsIgnoreCase(s);
    }

    private static int toIntSafe(Object v, int def) {
        if (v == null) return def;
        if (v instanceof Number n) return n.intValue();
        try {
            return Integer.parseInt(String.valueOf(v));
        } catch (Exception e) {
            return def;
        }
    }

    private String readableError(Throwable throwable) {
        Throwable cur = throwable;
        while (cur.getCause() != null) {
            cur = cur.getCause();
        }
        String msg = cur.getMessage();
        if (msg == null || msg.isBlank()) {
            msg = throwable.getMessage();
        }
        if (msg == null || msg.isBlank()) {
            return "未知错误";
        }
        return msg.length() > 500 ? msg.substring(0, 500) : msg;
    }

    @Data
    public static class CreateStudentViolationBody {
        private String targetUserId;
        private String violationText;
        private List<String> imageUrls;
        private Boolean forbidEnter;
        private Integer maxEnterSuccess;
        private Boolean showNoticeEveryScan;
        private Integer expireAfterDays;
        /** 交互式确认短语；非空时与 forbidEnter 勾选联动为强制禁入 */
        private String interactiveChallenge;
        /** 交互验证完成后是否自动解除禁入；默认 true */
        private Boolean interactiveUnlockOnVerify;
        /** 关联触发规则ID（不传则自动使用 MANUAL 规则） */
        private Long ruleId;
        /** 关联笼架违规父记录ID */
        private Long cageViolationId;
    }

    @Data
    public static class BatchCreateStudentViolationBody {
        private List<String> targetUserIds;
        private String violationText;
        private List<String> imageUrls;
        private Boolean forbidEnter;
        private Integer maxEnterSuccess;
        private Boolean showNoticeEveryScan;
        private Integer expireAfterDays;
        /** 交互式确认短语；非空时与 forbidEnter 勾选联动为强制禁入 */
        private String interactiveChallenge;
        private Boolean interactiveUnlockOnVerify;
        private Long ruleId;
        /** 关联笼架违规父记录ID */
        private Long cageViolationId;
    }

    @Data
    public static class UpdateStudentViolationBody {
        private String violationText;
        private List<String> imageUrls;
        private Boolean forbidEnter;
        private Integer maxEnterSuccess;
        private Boolean showNoticeEveryScan;
        /** KEEP（默认）| CLEAR | RELATIVE */
        private String expireMode;
        /** RELATIVE 时：从当前时刻起算的天数 */
        private Integer expireAfterDays;
        /** 交互式确认短语；null 或空串=关闭；非空时与 forbidEnter 联动为强制禁入 */
        private String interactiveChallenge;
        /** 交互验证完成后是否自动解除禁入 */
        private Boolean interactiveUnlockOnVerify;
    }

    // ---- 违规文案模板预设 ----

    @GetMapping("/text-templates")
    @Operation(summary = "获取违规文案模板列表")
    public Result<?> listTextTemplates(
            @RequestHeader(value = "Authorization", required = false) String authorization
    ) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        List<ViolationTextTemplate> list = templateService.listAll();
        List<Map<String, Object>> out = new java.util.ArrayList<>();
        for (ViolationTextTemplate t : list) {
            Map<String, Object> m = new HashMap<>();
            m.put("id", t.getId());
            m.put("name", t.getName());
            m.put("violationText", t.getViolationText());
            m.put("sortOrder", t.getSortOrder());
            m.put("createdAt", t.getCreatedAt());
            m.put("updatedAt", t.getUpdatedAt());
            out.add(m);
        }
        return Result.success(out);
    }

    @PostMapping("/text-templates")
    @Operation(summary = "新建违规文案模板")
    public Result<?> createTextTemplate(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestBody Map<String, Object> body
    ) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        String name = body != null ? Objects.toString(body.get("name"), "") : "";
        String text = body != null ? Objects.toString(body.get("violationText"), "") : "";
        int sort = toIntSafe(body != null ? body.get("sortOrder") : null, 0);
        if (text.isBlank()) return Result.error("违规文案不能为空");
        ViolationTextTemplate t = templateService.create(name, text, sort);
        return Result.success(Map.of("id", t.getId(), "name", t.getName()));
    }

    @PutMapping("/text-templates/{id}")
    @Operation(summary = "更新违规文案模板")
    public Result<?> updateTextTemplate(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable("id") long id,
            @RequestBody Map<String, Object> body
    ) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        try {
            String name = body != null ? Objects.toString(body.get("name"), null) : null;
            String text = body != null ? Objects.toString(body.get("violationText"), null) : null;
            Integer sort = body != null && body.get("sortOrder") != null
                    ? toIntSafe(body.get("sortOrder"), 0) : null;
            ViolationTextTemplate t = templateService.update(id, name, text, sort);
            return Result.success(Map.of("id", t.getId(), "name", t.getName()));
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        }
    }

    @DeleteMapping("/text-templates/{id}")
    @Operation(summary = "删除违规文案模板")
    public Result<?> deleteTextTemplate(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable("id") long id
    ) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        boolean ok = templateService.delete(id);
        return ok ? Result.success() : Result.error("模板不存在");
    }

    // ---- 滞留自动违规配置 ----

    /**
     * @deprecated 使用 GET /api/admin/twin/student-violations/rules 代替。
     *             配置已迁移至 twin_violation_rule 表（rule_code='AUTO_STRANDED'）。
     */
    @Deprecated
    @GetMapping("/stranded-config")
    @Operation(summary = "获取滞留自动违规配置")
    public Result<?> getStrandedConfig(
            @RequestHeader(value = "Authorization", required = false) String authorization
    ) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) {
            return denied;
        }
        return Result.success(strandedViolationService.getConfig());
    }

    /**
     * @deprecated 使用 PUT /api/admin/twin/student-violations/rules/{id} 代替。
     *             配置已迁移至 twin_violation_rule 表（rule_code='AUTO_STRANDED'）。
     */
    @Deprecated
    @PutMapping("/stranded-config")
    @Operation(summary = "保存滞留自动违规配置")
    public Result<?> saveStrandedConfig(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestBody Map<String, Object> body
    ) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) {
            return denied;
        }
        strandedViolationService.saveConfig(body);
        return Result.success(strandedViolationService.getConfig());
    }

    /**
     * @deprecated 测试逻辑已迁移至规则执行引擎。
     *             请通过 POST /api/admin/twin/student-violations/rules 管理规则，
     *             并通过触发条件验证行为。
     */
    @Deprecated
    @PostMapping("/stranded-config/test")
    @Operation(summary = "对单个用户测试滞留检测（不写回 config execution result）")
    public Result<?> testStrandedSingle(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestBody Map<String, Object> body
    ) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) {
            return denied;
        }
        String userId = body != null ? Objects.toString(body.get("userId"), "") : "";
        if (userId.isBlank()) {
            return Result.error("缺少 userId");
        }
        boolean autoSignout = body != null && Boolean.TRUE.equals(toBool(body.get("autoSignout")));
        String summary = strandedViolationService.testSingleUser(userId, autoSignout);
        return Result.success(Map.of("userId", userId, "summary", summary));
    }

    @GetMapping("/stranded-signout-config")
    @Operation(summary = "获取第二道滞留定时签退配置（id=2，仅签退开关）")
    public Result<?> getStrandedSignoutConfig(
            @RequestHeader(value = "Authorization", required = false) String authorization
    ) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) {
            return denied;
        }
        return Result.success(strandedViolationService.getSignoutConfig());
    }

    @PutMapping("/stranded-signout-config")
    @Operation(summary = "保存第二道滞留定时签退配置")
    public Result<?> saveStrandedSignoutConfig(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestBody Map<String, Object> body
    ) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) {
            return denied;
        }
        strandedViolationService.saveSignoutConfig(body != null ? body : Map.of());
        return Result.success(strandedViolationService.getSignoutConfig());
    }

    // ═══ 违规触发规则 CRUD ═══

    @GetMapping("/rules")
    @Operation(summary = "触发规则列表")
    public Result<?> listRules(
            @RequestHeader(value = "Authorization", required = false) String authorization
    ) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        return Result.success(ruleService.listAll());
    }

    @GetMapping("/rules/{id}")
    @Operation(summary = "触发规则详情")
    public Result<?> getRule(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable("id") long id
    ) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        TwinViolationRule rule = ruleService.getById(id);
        return rule != null ? Result.success(rule) : Result.error("规则不存在");
    }

    @PostMapping("/rules")
    @Operation(summary = "新建触发规则")
    public Result<?> createRule(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestBody TwinViolationRule body
    ) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        try {
            return Result.success(ruleService.create(body));
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        }
    }

    @PutMapping("/rules/{id}")
    @Operation(summary = "编辑触发规则")
    public Result<?> updateRule(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable("id") long id,
            @RequestBody TwinViolationRule body
    ) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        body.setId(id);
        try {
            return Result.success(ruleService.update(body));
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        }
    }

    @DeleteMapping("/rules/{id}")
    @Operation(summary = "删除触发规则（有关联违规记录时禁止）")
    public Result<?> deleteRule(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable("id") long id
    ) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        try {
            boolean ok = ruleService.delete(id);
            return ok ? Result.success() : Result.error("规则不存在");
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        }
    }
}
