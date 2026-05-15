package com.example.demo.modules.notification.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.modules.notification.service.NotificationSettingsService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/public/runtime-config")
@Tag(name = "运行时配置", description = "公开可读的前端运行时配置")
public class RuntimeConfigController {
    private final NotificationSettingsService settingsService;

    public RuntimeConfigController(NotificationSettingsService settingsService) {
        this.settingsService = settingsService;
    }

    @GetMapping
    @Operation(summary = "获取运行时配置白名单")
    public Result<?> getRuntimeConfig() {
        return Result.success(settingsService.getPublicRuntimeConfig());
    }
}
