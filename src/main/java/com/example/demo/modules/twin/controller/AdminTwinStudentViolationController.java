package com.example.demo.modules.twin.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.auth.service.UserDisplayNameService;
import com.example.demo.modules.twin.entity.TwinStudentViolation;
import com.example.demo.modules.twin.service.TwinStudentViolationService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.Data;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/admin/twin/student-violations")
@Tag(name = "Twin-Student-Violation", description = "学生违规管理（管理员绑定人员、通告与进房限制）")
public class AdminTwinStudentViolationController {

    private final TwinStudentViolationService violationService;
    private final AuthContextService authContextService;
    private final UserDisplayNameService userDisplayNameService;

    public AdminTwinStudentViolationController(
            TwinStudentViolationService violationService,
            AuthContextService authContextService,
            UserDisplayNameService userDisplayNameService
    ) {
        this.violationService = violationService;
        this.authContextService = authContextService;
        this.userDisplayNameService = userDisplayNameService;
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
                    body.getExpireAfterDays()
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
            TwinStudentViolation row = violationService.create(
                    body.getTargetUserId().trim(),
                    body.getViolationText() != null ? body.getViolationText() : "",
                    body.getImageUrls(),
                    Boolean.TRUE.equals(body.getForbidEnter()),
                    maxEnter,
                    body.getShowNoticeEveryScan() == null || Boolean.TRUE.equals(body.getShowNoticeEveryScan()),
                    body.getExpireAfterDays(),
                    admin.getId()
            );
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
        m.put("maxEnterSuccess", v.getMaxEnterSuccess());
        m.put("enterSuccessCount", v.getEnterSuccessCount());
        m.put("showNoticeEveryScan", v.getShowNoticeEveryScan());
        m.put("expireAt", v.getExpireAt());
        m.put("status", v.getStatus());
        m.put("createdByUserId", v.getCreatedByUserId());
        m.put("createdAt", v.getCreatedAt());
        m.put("updatedAt", v.getUpdatedAt());
        m.put("clearedAt", v.getClearedAt());
        m.put("clearedByUserId", v.getClearedByUserId());
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
        RoleEnum role = user.getRole() != null ? user.getRole() : RoleEnum.STUDENT;
        if (role.getLevel() < RoleEnum.ADMIN.getLevel()) {
            return Result.error("无权限访问（需管理员及以上）");
        }
        return null;
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
    }
}
