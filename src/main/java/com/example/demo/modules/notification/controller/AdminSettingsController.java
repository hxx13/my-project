package com.example.demo.modules.notification.controller;

import com.example.demo.common.config.AdminAuthInterceptor;
import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.notification.dto.MiniProgramTestSendRequest;
import com.example.demo.modules.notification.dto.UpdateNotifyRuleRequest;
import com.example.demo.modules.notification.dto.UpdateNotifyTemplateRequest;
import com.example.demo.modules.notification.dto.UpdateSystemConfigRequest;
import com.example.demo.modules.llm.service.DashScopeChatClient;
import com.example.demo.modules.llm.service.LlmConfigService;
import com.example.demo.modules.notification.service.MiniProgramNotificationService;
import com.example.demo.modules.notification.service.NotificationSettingsService;
import com.example.demo.modules.twin.service.ClientReloadBroadcastService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/admin/settings")
@Tag(name = "系统设置", description = "通知规则、模板、配置项管理")
public class AdminSettingsController {
    private final NotificationSettingsService settingsService;
    private final MiniProgramNotificationService miniProgramNotificationService;
    private final ClientReloadBroadcastService clientReloadBroadcastService;
    private final DashScopeChatClient dashScopeChatClient;
    private final LlmConfigService llmConfigService;

    public AdminSettingsController(NotificationSettingsService settingsService,
                                   MiniProgramNotificationService miniProgramNotificationService,
                                   ClientReloadBroadcastService clientReloadBroadcastService,
                                   DashScopeChatClient dashScopeChatClient,
                                   LlmConfigService llmConfigService) {
        this.settingsService = settingsService;
        this.miniProgramNotificationService = miniProgramNotificationService;
        this.clientReloadBroadcastService = clientReloadBroadcastService;
        this.dashScopeChatClient = dashScopeChatClient;
        this.llmConfigService = llmConfigService;
    }

    @GetMapping("/modules")
    @Operation(summary = "获取配置模块列表")
    public Result<?> modules(HttpServletRequest request) {
        Result<?> denied = requireSuperAdmin(request);
        if (denied != null) return denied;
        return Result.success(settingsService.listModules());
    }

    @GetMapping("/notification-rules")
    @Operation(summary = "获取通知规则")
    public Result<?> rules(HttpServletRequest request) {
        Result<?> denied = requireSuperAdmin(request);
        if (denied != null) return denied;
        return Result.success(settingsService.listRules());
    }

    @PatchMapping("/notification-rules/{id}")
    @Operation(summary = "更新通知规则")
    public Result<?> updateRule(@PathVariable Long id,
                                @RequestBody UpdateNotifyRuleRequest request,
                                HttpServletRequest httpRequest) {
        Result<?> denied = requireSuperAdmin(httpRequest);
        if (denied != null) return denied;
        return settingsService.updateRule(id, request) ? Result.success() : Result.error("更新规则失败");
    }

    @GetMapping("/templates")
    @Operation(summary = "获取通知模板")
    public Result<?> templates(HttpServletRequest request) {
        Result<?> denied = requireSuperAdmin(request);
        if (denied != null) return denied;
        return Result.success(settingsService.listTemplates());
    }

    @PatchMapping("/templates/{id}")
    @Operation(summary = "更新通知模板")
    public Result<?> updateTemplate(@PathVariable Long id,
                                    @RequestBody UpdateNotifyTemplateRequest request,
                                    HttpServletRequest httpRequest) {
        Result<?> denied = requireSuperAdmin(httpRequest);
        if (denied != null) return denied;
        return settingsService.updateTemplate(id, request) ? Result.success() : Result.error("更新模板失败");
    }

    @GetMapping("/configs")
    @Operation(summary = "按模块获取配置项")
    public Result<?> configs(@RequestParam String module, HttpServletRequest request) {
        Result<?> denied = requireSuperAdmin(request);
        if (denied != null) return denied;
        return Result.success(settingsService.listConfigs(module));
    }

    @GetMapping("/config-definitions")
    @Operation(summary = "按模块获取配置定义")
    public Result<?> configDefinitions(@RequestParam String module, HttpServletRequest request) {
        Result<?> denied = requireSuperAdmin(request);
        if (denied != null) return denied;
        return Result.success(settingsService.listConfigDefinitions(module));
    }

    @PatchMapping("/configs/{id}")
    @Operation(summary = "更新配置项")
    public Result<?> updateConfig(@PathVariable Long id,
                                  @RequestBody UpdateSystemConfigRequest request,
                                  HttpServletRequest httpRequest) {
        Result<?> denied = requireSuperAdmin(httpRequest);
        if (denied != null) return denied;
        User currentUser = (User) httpRequest.getAttribute(AdminAuthInterceptor.CURRENT_ADMIN_USER_ATTR);
        return settingsService.updateConfig(id, request, currentUser == null ? null : currentUser.getId()) ? Result.success() : Result.error("更新配置失败");
    }

    @PostMapping("/broadcast-client-reload")
    @Operation(summary = "通知所有已连接的前端页面强制刷新（部署新静态资源后用于同步大屏等）")
    public Result<?> broadcastClientReload(HttpServletRequest httpRequest) {
        Result<?> denied = requireSuperAdmin(httpRequest);
        if (denied != null) {
            return denied;
        }
        User currentUser = (User) httpRequest.getAttribute(AdminAuthInterceptor.CURRENT_ADMIN_USER_ATTR);
        String operatorId = currentUser != null ? currentUser.getId() : "";
        return Result.success(clientReloadBroadcastService.broadcastForceReload(operatorId));
    }

    @PostMapping("/llm/test-connection")
    @Operation(summary = "测试大模型 API 连接（使用当前系统设置中的 Key 与 Base URL）")
    public Result<?> testLlmConnection(HttpServletRequest httpRequest) {
        Result<?> denied = requireSuperAdmin(httpRequest);
        if (denied != null) {
            return denied;
        }
        try {
            llmConfigService.assertReady();
            String reply = dashScopeChatClient.ping();
            return Result.success(Map.of(
                    "ok", true,
                    "model", llmConfigService.getModel(),
                    "baseUrl", llmConfigService.getBaseUrl(),
                    "reply", reply));
        } catch (IllegalStateException e) {
            return Result.error(e.getMessage());
        }
    }

    @PostMapping("/mini-program/test-send")
    @Operation(summary = "小程序通道测试发送")
    public Result<?> testMiniProgramSend(@RequestBody MiniProgramTestSendRequest request,
                                         HttpServletRequest httpRequest) {
        Result<?> denied = requireSuperAdmin(httpRequest);
        if (denied != null) return denied;
        if (request == null || request.getTargetUserId() == null || request.getTemplateKey() == null
                || request.getTargetUserId().isBlank() || request.getTemplateKey().isBlank()) {
            return Result.error("测试发送参数不完整");
        }
        return Result.success(miniProgramNotificationService.testSend(request.getTargetUserId().trim(), request.getTemplateKey().trim()));
    }

    private Result<?> requireSuperAdmin(HttpServletRequest request) {
        Object attr = request.getAttribute(AdminAuthInterceptor.CURRENT_ADMIN_USER_ATTR);
        if (!(attr instanceof User currentUser)) {
            return Result.error("当前登录信息无效");
        }
        RoleEnum currentRole = currentUser.getRole() == null ? RoleEnum.STUDENT : currentUser.getRole();
        if (currentRole.getLevel() < RoleEnum.SUPER_ADMIN.getLevel()) {
            return Result.error("无权限访问");
        }
        return null;
    }
}
