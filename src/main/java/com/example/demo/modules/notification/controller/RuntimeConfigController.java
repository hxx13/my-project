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
import java.util.Set;

@RestController
@RequestMapping("/api/public/runtime-config")
@Tag(name = "运行时配置", description = "公开可读的前端运行时配置")
public class RuntimeConfigController {
    private final NotificationSettingsService settingsService;
    private final HttpsExtraPortRegistry httpsExtraPortRegistry;

    /**
     * 不对外返回的敏感 key 前缀集合。
     * 即使数据库误将此类 key 标记为 is_public=1，也会在此过滤。
     */
    private static final Set<String> SENSITIVE_KEY_PREFIXES = Set.of(
            "network.", "credentials.", "integration.", "llm.",
            "dahua.", "aro.", "wincc.", "face.", "system."
    );

    private static final Set<String> SENSITIVE_EXACT_KEYS = Set.of(
            "cameraHttpsPort"
    );

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
        // 过滤敏感 key：移除基础设施/凭证/集成类配置，防止泄露后端拓扑信息
        cfg.keySet().removeIf(key -> {
            if (SENSITIVE_EXACT_KEYS.contains(key)) return true;
            for (String prefix : SENSITIVE_KEY_PREFIXES) {
                if (key.startsWith(prefix)) return true;
            }
            return false;
        });
        // cameraHttpsPort 已移入 SENSITIVE_EXACT_KEYS，不再对外暴露
        return Result.success(cfg);
    }
}
