package com.example.demo.modules.me.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.me.dto.MiniPreferencesVo;
import com.example.demo.modules.me.dto.PendingBadgesView;
import com.example.demo.modules.me.inbox.InboxAggregationService;
import com.example.demo.modules.me.inbox.dto.InboxFeedResponse;
import com.example.demo.modules.me.service.MiniPreferencesService;
import com.example.demo.modules.me.service.PendingBadgesService;
import com.example.demo.modules.policy.dto.CapabilitySummaryRow;
import com.example.demo.modules.policy.service.CapabilityPolicyService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/me")
@Tag(name = "个人工作台", description = "当前用户聚合信息")
public class MeController {

    private final AuthContextService authContextService;
    private final PendingBadgesService pendingBadgesService;
    private final MiniPreferencesService miniPreferencesService;
    private final InboxAggregationService inboxAggregationService;
    private final CapabilityPolicyService capabilityPolicyService;

    public MeController(AuthContextService authContextService,
                          PendingBadgesService pendingBadgesService,
                          MiniPreferencesService miniPreferencesService,
                          InboxAggregationService inboxAggregationService,
                          CapabilityPolicyService capabilityPolicyService) {
        this.authContextService = authContextService;
        this.pendingBadgesService = pendingBadgesService;
        this.miniPreferencesService = miniPreferencesService;
        this.inboxAggregationService = inboxAggregationService;
        this.capabilityPolicyService = capabilityPolicyService;
    }

    @GetMapping("/pending-badges")
    @Operation(summary = "待处理角标（报修/采购/物资/消息及处理侧）。申请人侧与小程序列表默认 onlyMine=false、excludeBizTypes 一致；处理侧「全库/可见池」分界由业务能力策略 min_role_view_all_pending 决定；另返回 badgeCounters 扩展 Map。")
    public Result<PendingBadgesView> pendingBadges(HttpServletRequest request) {
        User user = authContextService.resolveUserFromBearer(request.getHeader("Authorization"));
        if (user == null) {
            return Result.error("未登录或Token无效");
        }
        if (user.getStatus() != null && user.getStatus() == 0) {
            return Result.error("账号已禁用");
        }
        return Result.success(pendingBadgesService.build(user));
    }

    @GetMapping("/inbox/feed")
    @Operation(summary = "聚合收件箱时间线（通知+待办工单摘要），分页参数 limit/beforeMillis")
    public Result<InboxFeedResponse> inboxFeed(HttpServletRequest request,
                                               @RequestParam(defaultValue = "20") int limit,
                                               @RequestParam(required = false) Long beforeMillis) {
        User user = authContextService.resolveUserFromBearer(request.getHeader("Authorization"));
        if (user == null) {
            return Result.error("未登录或Token无效");
        }
        if (user.getStatus() != null && user.getStatus() == 0) {
            return Result.error("账号已禁用");
        }
        return Result.success(inboxAggregationService.buildFeed(user, limit, beforeMillis));
    }

    @GetMapping("/capability-summary")
    @Operation(summary = "当前用户对各业务域的提交/处理/全库待办能力摘要（按钮显隐）")
    public Result<List<CapabilitySummaryRow>> capabilitySummary(HttpServletRequest request) {
        User user = authContextService.resolveUserFromBearer(request.getHeader("Authorization"));
        if (user == null) {
            return Result.error("未登录或Token无效");
        }
        if (user.getStatus() != null && user.getStatus() == 0) {
            return Result.error("账号已禁用");
        }
        return Result.success(capabilityPolicyService.summarizeForUser(user));
    }

    @GetMapping("/mini-preferences")
    @Operation(summary = "小程序个人配置（房间关注区域等）")
    public Result<MiniPreferencesVo> getMiniPreferences(HttpServletRequest request) {
        User user = authContextService.resolveUserFromBearer(request.getHeader("Authorization"));
        if (user == null) {
            return Result.error("未登录或Token无效");
        }
        if (user.getStatus() != null && user.getStatus() == 0) {
            return Result.error("账号已禁用");
        }
        return Result.success(miniPreferencesService.load(user.getId()));
    }

    @PutMapping("/mini-preferences")
    @Operation(summary = "保存小程序个人配置")
    public Result<MiniPreferencesVo> putMiniPreferences(HttpServletRequest request, @RequestBody MiniPreferencesVo body) {
        User user = authContextService.resolveUserFromBearer(request.getHeader("Authorization"));
        if (user == null) {
            return Result.error("未登录或Token无效");
        }
        if (user.getStatus() != null && user.getStatus() == 0) {
            return Result.error("账号已禁用");
        }
        try {
            return Result.success(miniPreferencesService.save(user.getId(), body));
        } catch (Exception e) {
            return Result.error("保存失败");
        }
    }
}
