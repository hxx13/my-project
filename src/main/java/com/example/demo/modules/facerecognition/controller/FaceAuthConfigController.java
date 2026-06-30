package com.example.demo.modules.facerecognition.controller;

import com.example.demo.common.config.ApiAuthInterceptor;
import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.facerecognition.service.FaceAuthConfigService;
import com.example.demo.modules.facerecognition.service.FaceCompareService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/face/config")
@Tag(name = "人脸识别总控", description = "总开关 + 下级开关")
public class FaceAuthConfigController {

    private final FaceAuthConfigService configService;
    private final FaceCompareService compareService;
    private final JdbcTemplate jdbcTemplate;

    public FaceAuthConfigController(FaceAuthConfigService configService,
                                    FaceCompareService compareService,
                                    JdbcTemplate jdbcTemplate) {
        this.configService = configService;
        this.compareService = compareService;
        this.jdbcTemplate = jdbcTemplate;
    }

    @GetMapping
    @Operation(summary = "获取所有开关状态")
    public Result<Map<String, Object>> getAll() {
        return Result.success(configService.getAllConfigs());
    }

    @GetMapping("/env-thresholds")
    @Operation(summary = "环境变量阈值（只读，供管理端展示）")
    public Result<Map<String, Object>> envThresholds(HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.ADMIN);
        if (denied != null) return Result.error(denied.getMessage());
        return Result.success(configService.getEnvThresholdConfig());
    }

    @GetMapping("/model-status")
    @Operation(summary = "服务端比对模型加载状态（诊断用）")
    public Result<Map<String, Object>> modelStatus(HttpServletRequest request) {
        Result<?> denied = requireLoggedIn(request);
        if (denied != null) return Result.error(denied.getMessage());
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("ready", compareService.isReady());
        data.put("modelVersion", compareService.getModelVersion());
        if (!compareService.isReady() && compareService.getInitError() != null) {
            data.put("initError", compareService.getInitError());
        }
        return Result.success(data);
    }

    private Result<?> requireLoggedIn(HttpServletRequest request) {
        Object attr = request.getAttribute(ApiAuthInterceptor.CURRENT_USER_ATTR);
        if (!(attr instanceof User)) {
            return Result.error("未登录或 Token 无效");
        }
        return null;
    }

    @PutMapping
    @Operation(summary = "批量保存开关")
    public Result<Void> saveAll(@RequestBody Map<String, Boolean> switches, HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.ADMIN);
        if (denied != null) return Result.error(denied.getMessage());
        for (Map.Entry<String, Boolean> e : switches.entrySet()) {
            setConfigValue(e.getKey(), String.valueOf(e.getValue()));
        }
        return Result.success(null);
    }

    private void setConfigValue(String key, String value) {
        int updated = jdbcTemplate.update(
                "UPDATE sys_system_config SET config_value = ?, update_time = NOW() WHERE module = ? AND config_key = ?",
                value, "face", key);
        if (updated == 0) {
            jdbcTemplate.update(
                    "INSERT INTO sys_system_config (module, config_key, config_value, update_time) VALUES (?,?,?, NOW())",
                    "face", key, value);
        }
    }

    private Result<?> requireMinRole(HttpServletRequest request, RoleEnum minRole) {
        Object attr = request.getAttribute(ApiAuthInterceptor.CURRENT_USER_ATTR);
        if (!(attr instanceof User currentUser)) {
            return Result.error("未登录或 Token 无效");
        }
        RoleEnum currentRole = currentUser.getRole() == null ? RoleEnum.MEMBER : currentUser.getRole();
        if (currentRole.getLevel() < minRole.getLevel()) {
            return Result.error("无权限访问");
        }
        return null;
    }
}
