package com.example.demo.modules.notification.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.notification.dto.MarkReadByBizRequest;
import com.example.demo.modules.notification.dto.MiniSubscribeAckRequest;
import com.example.demo.modules.notification.dto.UnreadBizKeysRequest;
import com.example.demo.modules.notification.service.NotificationPushService;
import com.example.demo.modules.notification.service.MiniProgramNotificationService;
import com.example.demo.modules.notification.service.NotificationService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/notifications")
@Tag(name = "通知中心", description = "站内通知与小程序订阅相关接口；列表与已读仅面向当前登录用户收件记录，与角色无关")
public class NotificationController {
    private final AuthContextService authContextService;
    private final NotificationService notificationService;
    private final NotificationPushService notificationPushService;
    private final MiniProgramNotificationService miniProgramNotificationService;

    public NotificationController(AuthContextService authContextService,
                                  NotificationService notificationService,
                                  NotificationPushService notificationPushService,
                                  MiniProgramNotificationService miniProgramNotificationService) {
        this.authContextService = authContextService;
        this.notificationService = notificationService;
        this.notificationPushService = notificationPushService;
        this.miniProgramNotificationService = miniProgramNotificationService;
    }

    @GetMapping
    @Operation(summary = "分页查询通知")
    public Result<?> list(@RequestHeader(value = "Authorization", required = false) String authorization,
                          @RequestParam(defaultValue = "1") int page,
                          @RequestParam(defaultValue = "20") int size,
                          @RequestParam(defaultValue = "false") boolean onlyUnread,
                          @RequestParam(required = false) String bizType,
                          @RequestParam(required = false) String excludeBizType,
                          @RequestParam(required = false) String excludeBizTypes) {
        User user = resolveUser(authorization);
        Result<?> denied = requireAuthenticated(user);
        if (denied != null) return denied;
        return Result.success(notificationService.listForUser(user.getId(), page, size, onlyUnread, bizType, excludeBizType, excludeBizTypes));
    }

    @PatchMapping("/{id}/read")
    @Operation(summary = "单条通知已读")
    public Result<?> markRead(@RequestHeader(value = "Authorization", required = false) String authorization,
                              @PathVariable String id) {
        User user = resolveUser(authorization);
        Result<?> denied = requireAuthenticated(user);
        if (denied != null) return denied;
        int affected = notificationService.markRead(user.getId(), id);
        Map<String, Object> data = new HashMap<>();
        data.put("affected", affected);
        return Result.success(data);
    }

    @PatchMapping("/read-by-biz")
    @Operation(summary = "按业务单全部已读（同一 bizType+bizId 下全部事件通知）")
    public Result<?> markReadByBiz(@RequestHeader(value = "Authorization", required = false) String authorization,
                                   @RequestBody MarkReadByBizRequest request) {
        User user = resolveUser(authorization);
        Result<?> denied = requireAuthenticated(user);
        if (denied != null) return denied;
        if (request == null || request.getBizType() == null || request.getBizType().isBlank()
                || request.getBizId() == null || request.getBizId().isBlank()) {
            return Result.error("bizType 与 bizId 不能为空");
        }
        int affected = notificationService.markReadByBiz(user.getId(), request.getBizType(), request.getBizId());
        Map<String, Object> data = new HashMap<>();
        data.put("affected", affected);
        data.put("bizType", request.getBizType().trim().toUpperCase());
        data.put("bizId", request.getBizId().trim());
        return Result.success(data);
    }

    @PostMapping("/unread-biz-flags")
    @Operation(summary = "批量查询业务单是否仍有未读通知")
    public Result<?> unreadBizFlags(@RequestHeader(value = "Authorization", required = false) String authorization,
                                    @RequestBody UnreadBizKeysRequest request) {
        User user = resolveUser(authorization);
        Result<?> denied = requireAuthenticated(user);
        if (denied != null) return denied;
        List<UnreadBizKeysRequest.BizKeyItem> keys = request == null ? List.of() : request.getKeys();
        Map<String, Boolean> flags = notificationService.resolveUnreadBizFlags(user.getId(), keys);
        return Result.success(Map.of("flags", flags));
    }

    @PatchMapping("/read-all")
    @Operation(summary = "全部已读")
    public Result<?> markAllRead(@RequestHeader(value = "Authorization", required = false) String authorization) {
        User user = resolveUser(authorization);
        Result<?> denied = requireAuthenticated(user);
        if (denied != null) return denied;
        int affected = notificationService.markAllRead(user.getId());
        return Result.success(Map.of("affected", affected));
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "删除单条通知（仅当前用户收件记录）")
    public Result<?> delete(@RequestHeader(value = "Authorization", required = false) String authorization,
                            @PathVariable String id) {
        User user = resolveUser(authorization);
        Result<?> denied = requireAuthenticated(user);
        if (denied != null) return denied;
        boolean deleted = notificationService.deleteForUser(user.getId(), id);
        if (!deleted) return Result.error("通知不存在或无权限删除");
        return Result.success();
    }

    @GetMapping("/unread-count")
    @Operation(summary = "查询未读数量")
    public Result<?> unreadCount(@RequestHeader(value = "Authorization", required = false) String authorization) {
        User user = resolveUser(authorization);
        Result<?> denied = requireAuthenticated(user);
        if (denied != null) return denied;
        Map<String, Object> data = new HashMap<>();
        data.put("count", notificationService.countUnread(user.getId()));
        return Result.success(data);
    }

    @GetMapping("/completion-receipts/unread")
    @Operation(summary = "办结回执未读列表与数量（报修/采购/物资领用 COMPLETED）")
    public Result<?> unreadCompletionReceipts(@RequestHeader(value = "Authorization", required = false) String authorization,
                                              @RequestParam(defaultValue = "30") int limit) {
        User user = resolveUser(authorization);
        Result<?> denied = requireAuthenticated(user);
        if (denied != null) return denied;
        Map<String, Object> data = new HashMap<>();
        data.put("count", notificationService.countUnreadCompletionReceipts(user.getId()));
        data.put("items", notificationService.listUnreadCompletionReceipts(user.getId(), limit));
        return Result.success(data);
    }

    @GetMapping(value = "/stream", produces = "text/event-stream")
    @Operation(summary = "SSE实时通知流")
    public SseEmitter stream(@RequestParam("token") String token) {
        User user = resolveUser("Bearer " + token);
        Result<?> denied = requireAuthenticated(user);
        if (denied != null) {
            throw new IllegalArgumentException(denied.getMessage() != null ? denied.getMessage() : "无权限订阅通知");
        }
        return notificationPushService.subscribe(user.getId());
    }

    @PostMapping("/mini-program/subscribe/ack")
    @Operation(summary = "小程序订阅授权回执")
    public Result<?> ackSubscription(@RequestHeader(value = "Authorization", required = false) String authorization,
                                     @RequestBody MiniSubscribeAckRequest request) {
        User user = resolveUser(authorization);
        Result<?> denied = requireAuthenticated(user);
        if (denied != null) return denied;
        if (request == null || request.getAccepted() == null || request.getTemplateKey() == null || request.getTemplateKey().isBlank()) {
            return Result.error("订阅参数不完整");
        }
        miniProgramNotificationService.ackSubscription(user.getId(), request.getTemplateKey(), request.getAccepted());
        return Result.success();
    }

    @GetMapping("/mini-program/subscriptions")
    @Operation(summary = "查询小程序订阅状态")
    public Result<?> listSubscriptions(@RequestHeader(value = "Authorization", required = false) String authorization) {
        User user = resolveUser(authorization);
        Result<?> denied = requireAuthenticated(user);
        if (denied != null) return denied;
        return Result.success(miniProgramNotificationService.listSubscriptions(user.getId()));
    }

    private User resolveUser(String authorization) {
        User user = authContextService.resolveUserFromBearer(authorization);
        if (user == null) return null;
        if (user.getRole() == null) user.setRole(RoleEnum.MEMBER);
        return user;
    }

    /** 通知数据按收件人 userId 隔离，任意已登录且未禁用用户可访问自己的通知 */
    private Result<?> requireAuthenticated(User user) {
        if (user == null) return Result.error("未登录或Token无效");
        if (user.getStatus() != null && user.getStatus() == 0) return Result.error("账号已禁用");
        return null;
    }
}
