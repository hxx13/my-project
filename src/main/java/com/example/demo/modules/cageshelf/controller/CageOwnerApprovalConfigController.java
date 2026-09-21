package com.example.demo.modules.cageshelf.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.cageshelf.entity.CageOwnerApprovalConfig;
import com.example.demo.modules.cageshelf.service.CageOwnerApprovalConfigService;
import com.example.demo.modules.cageshelf.service.CageRegionGrantService;
import com.example.demo.modules.cageshelf.service.CageReviewVetService;
import com.example.demo.modules.identity.service.PersonIdentityService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;

import jakarta.servlet.http.HttpServletRequest;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 所属人审核配置：到位确认 / 分笼审核 / 转移审核三个开关，按所属人维护。
 * 入口在笼架信息「设置中心」。权限：本人可配自己的（普通账号也允许），
 * 配别人/看总览要求 SUPER_ADMIN 及以上。
 */
@RestController
@RequestMapping("/api/cage-owner-approval-config")
@Tag(name = "所属人审核配置")
public class CageOwnerApprovalConfigController {

    private static final Logger log = LoggerFactory.getLogger(CageOwnerApprovalConfigController.class);

    private final AuthContextService authContextService;
    private final CageOwnerApprovalConfigService configService;
    private final CageReviewVetService reviewVetService;
    private final CageRegionGrantService regionGrantService;

    public CageOwnerApprovalConfigController(AuthContextService authContextService,
                                             CageOwnerApprovalConfigService configService,
                                             CageReviewVetService reviewVetService,
                                             CageRegionGrantService regionGrantService) {
        this.authContextService = authContextService;
        this.configService = configService;
        this.reviewVetService = reviewVetService;
        this.regionGrantService = regionGrantService;
    }

    /**
     * 能否操作某所属人的配置：本人放行，否则要求 SUPER_ADMIN 及以上。
     * 两侧都先折成 canonical（STAFF_* → ARO 编号）再比 —— owner_account_id 存的是 canonical，
     * 拿 u.getId() 裸比会漏判，把本人误挡在门外、或让越权漏过去。
     */
    private boolean canManage(User u, String ownerAccountId) {
        if (u == null) return false;
        if (u.getRole() != null && u.getRole().getLevel() >= RoleEnum.SUPER_ADMIN.getLevel()) return true;
        String me = configService.canonical(u.getId());
        String target = configService.canonical(ownerAccountId);
        return me != null && me.equals(target);
    }

    /**
     * SUPER_ADMIN 及以上才放行的统一门控。返回 null = 放行，否则是应当直接返回的失败结果。
     *
     * <p>泛型参数不能省：调用方的返回类型各不相同（Result&lt;Map&lt;String, Object&gt;&gt; 与 Result&lt;?&gt;），
     * 返回裸 Result 会让 Map 那个赋不进去。
     */
    private <T> Result<T> requireSuperAdmin(User u, String denyMessage) {
        if (u == null) return Result.fail(401, "未登录");
        if (u.getRole() == null || u.getRole().getLevel() < RoleEnum.SUPER_ADMIN.getLevel()) {
            return Result.fail(403, denyMessage);
        }
        return null;
    }

    /** 已配置的所属人总览（否则只有空表，看不出给谁配过）。仅 SUPER_ADMIN 及以上，避免账号枚举他人开关。 */
    @GetMapping
    @Operation(summary = "已配置的所属人列表")
    public Result<List<Map<String, Object>>> listAll(HttpServletRequest request) {
        User u = authContextService.resolveUserFromBearer(request.getHeader("Authorization"));
        Result<List<Map<String, Object>>> denied = requireSuperAdmin(u, "无权限查看全部所属人配置");
        if (denied != null) return denied;
        return Result.success(configService.listDetailed());
    }

    /** 某所属人的生效配置（没配过返回三个 true 的默认值）。本人或 SUPER_ADMIN 及以上可读。 */
    @GetMapping("/{ownerAccountId}")
    @Operation(summary = "查某所属人的审核配置")
    public Result<Map<String, Object>> get(@PathVariable String ownerAccountId, HttpServletRequest request) {
        User u = authContextService.resolveUserFromBearer(request.getHeader("Authorization"));
        if (u == null) return Result.fail(401, "未登录");
        if (!canManage(u, ownerAccountId)) return Result.fail(403, "只能查看自己的审核配置");
        CageOwnerApprovalConfig c = configService.effective(ownerAccountId);
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("ownerAccountId", c.getOwnerAccountId());
        m.put("confirmRequired", Boolean.TRUE.equals(c.getConfirmRequired()));
        m.put("divideApprovalRequired", Boolean.TRUE.equals(c.getDivideApprovalRequired()));
        m.put("transferApprovalRequired", Boolean.TRUE.equals(c.getTransferApprovalRequired()));
        return Result.success(m);
    }

    /** body: { confirmRequired, divideApprovalRequired, transferApprovalRequired }，整体覆盖。本人或 SUPER_ADMIN 及以上可写。 */
    @PutMapping("/{ownerAccountId}")
    @Operation(summary = "保存某所属人的审核配置")
    public Result<?> save(@PathVariable String ownerAccountId,
                          @RequestBody Map<String, Object> body,
                          HttpServletRequest request) {
        User u = authContextService.resolveUserFromBearer(request.getHeader("Authorization"));
        if (u == null) {
            return Result.fail(401, "未登录");
        }
        if (!canManage(u, ownerAccountId)) return Result.fail(403, "只能配置自己的审核开关");
        configService.save(ownerAccountId,
                asBool(body.get("confirmRequired")),
                asBool(body.get("divideApprovalRequired")),
                asBool(body.get("transferApprovalRequired")),
                u.getId());
        return Result.success(Map.of("ok", true));
    }

    private static Boolean asBool(Object v) {
        if (v == null) return null;
        if (v instanceof Boolean b) return b;
        return "true".equalsIgnoreCase(String.valueOf(v).trim());
    }

    /** 全局开关的当前值：强制审核 + 转移审核通知的二级开关。仅 SUPER_ADMIN 及以上。 */
    @GetMapping("/global")
    @Operation(summary = "读全局转移审核强制开关与审核通知开关")
    public Result<Map<String, Object>> getGlobal(HttpServletRequest request) {
        User u = authContextService.resolveUserFromBearer(request.getHeader("Authorization"));
        Result<Map<String, Object>> denied = requireSuperAdmin(u, "无权限查看全局审核配置");
        if (denied != null) return denied;
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("transferApprovalForced", configService.transferForced());
        out.put("transferReviewNotifyEnabled", configService.transferReviewNotifyEnabled());
        return Result.success(out);
    }

    /**
     * body: { transferApprovalForced?, transferReviewNotifyEnabled? }，**局部**更新 —— 只写传了的字段。
     *
     * <p>不做整包覆盖：两个开关在界面上是两个独立控件，整包 PUT 会让「只动通知」的那次
     * 顺手把强制审核也按默认值写回去，正是 mini-preferences 踩过的那个坑。仅 SUPER_ADMIN 及以上。
     */
    @PutMapping("/global")
    @Operation(summary = "设置全局转移审核强制开关 / 审核通知开关")
    public Result<?> saveGlobal(@RequestBody Map<String, Object> body, HttpServletRequest request) {
        User u = authContextService.resolveUserFromBearer(request.getHeader("Authorization"));
        Result<?> denied = requireSuperAdmin(u, "无权限修改全局审核配置");
        if (denied != null) return denied;
        Boolean forced = asBool(body == null ? null : body.get("transferApprovalForced"));
        Boolean notify = asBool(body == null ? null : body.get("transferReviewNotifyEnabled"));
        if (forced == null && notify == null) {
            return Result.fail(400, "transferApprovalForced 与 transferReviewNotifyEnabled 至少传一个");
        }
        try {
            if (forced != null) configService.setTransferForced(forced, u.getId());
            if (notify != null) configService.setTransferReviewNotifyEnabled(notify, u.getId());
            return Result.success(Map.of("ok", true));
        } catch (IllegalStateException e) {
            // 配置运行值行缺失（启动播种没跑）：给业务错误（HTTP 200 + success:false），把异常挡在这里
            log.warn("设置全局转移审核配置失败: {}", e.getMessage(), e);
            return Result.fail(500, e.getMessage());
        }
    }

    /** 审核兽医名单 + 候选人。仅 SUPER_ADMIN 及以上。 */
    @GetMapping("/review-vets")
    @Operation(summary = "读审核兽医名单与候选人")
    public Result<Map<String, Object>> getReviewVets(HttpServletRequest request) {
        User u = authContextService.resolveUserFromBearer(request.getHeader("Authorization"));
        Result<Map<String, Object>> denied = requireSuperAdmin(u, "无权限查看审核兽医名单");
        if (denied != null) return denied;
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("accountIds", reviewVetService.vetAccountIds());
        out.put("candidates", reviewVetService.annotateCandidates(
                regionGrantService.memberCandidates(PersonIdentityService.VETERINARIAN_CODE)));
        return Result.success(out);
    }

    /** body: { accountIds: [...] }，全量替换。仅 SUPER_ADMIN 及以上。 */
    @PutMapping("/review-vets")
    @Operation(summary = "保存审核兽医名单")
    public Result<?> saveReviewVets(@RequestBody Map<String, Object> body, HttpServletRequest request) {
        User u = authContextService.resolveUserFromBearer(request.getHeader("Authorization"));
        Result<?> denied = requireSuperAdmin(u, "无权限修改审核兽医名单");
        if (denied != null) return denied;
        List<String> ids = new ArrayList<>();
        if (body != null && body.get("accountIds") instanceof List<?> list) {
            for (Object o : list) {
                if (o != null && StringUtils.hasText(String.valueOf(o))) ids.add(String.valueOf(o));
            }
        }
        try {
            reviewVetService.replace(ids, u.getId());
            return Result.success(Map.of("ok", true));
        } catch (IllegalArgumentException e) {
            return Result.fail(400, e.getMessage());
        } catch (IllegalStateException e) {
            return Result.fail(500, e.getMessage());
        }
    }
}
