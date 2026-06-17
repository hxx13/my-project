package com.example.demo.modules.notification.controller;

import com.example.demo.common.config.HttpsExtraPortRegistry;
import com.example.demo.common.dto.Result;
import com.example.demo.modules.notification.service.NotificationSettingsService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/public/runtime-config")
@Tag(name = "运行时配置", description = "公开可读的前端运行时配置")
public class RuntimeConfigController {
    private final NotificationSettingsService settingsService;
    private final HttpsExtraPortRegistry httpsExtraPortRegistry;

    public RuntimeConfigController(
            NotificationSettingsService settingsService,
            HttpsExtraPortRegistry httpsExtraPortRegistry
    ) {
        this.settingsService = settingsService;
        this.httpsExtraPortRegistry = httpsExtraPortRegistry;
    }

    @GetMapping
    @Operation(summary = "获取运行时配置白名单")
    public Result<?> getRuntimeConfig() {
        Map<String, String> cfg = new LinkedHashMap<>(settingsService.getPublicRuntimeConfig());
        if (httpsExtraPortRegistry.isEnabled()) {
            cfg.put("cameraHttpsPort", String.valueOf(httpsExtraPortRegistry.getActivePort()));
        }
        return Result.success(cfg);
    }
}
