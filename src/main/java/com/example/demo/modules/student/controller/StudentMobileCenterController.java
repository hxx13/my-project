package com.example.demo.modules.student.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.student.entity.StudentMobileToken;
import com.example.demo.modules.student.service.StudentMobileTokenService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.*;

import jakarta.servlet.http.HttpServletRequest;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 免登录码管理：一人一码，扫码换取通用登录态。
 * 码等同登录凭证，查看/生成只允许本人或教职工及以上。
 */
@RestController
@Tag(name = "免登录码", description = "个人免登录二维码的查看与轮换")
public class StudentMobileCenterController {

    private static final Logger log = LoggerFactory.getLogger(StudentMobileCenterController.class);

    private final StudentMobileTokenService tokenService;
    private final AuthContextService authContextService;

    public StudentMobileCenterController(StudentMobileTokenService tokenService,
                                         AuthContextService authContextService) {
        this.tokenService = tokenService;
        this.authContextService = authContextService;
    }

    /** 管理端查看 */
    @GetMapping("/api/admin/student-mobile-token/{userId}")
    @Operation(summary = "查看账号当前活跃免登录码")
    public Result<Map<String, Object>> getTokenInfo(@PathVariable String userId,
                                                    HttpServletRequest request) {
        return getTokenInfoForUser(userId, request);
    }

    /** 扫码端查看：展示被扫人的码 */
    @GetMapping("/api/scan/student-mobile-token/{userId}")
    @Operation(summary = "扫码端查看被扫人的免登录码")
    public Result<Map<String, Object>> getScanTokenInfo(@PathVariable String userId,
                                                        HttpServletRequest request) {
        return getTokenInfoForUser(userId, request);
    }

    /** 管理端生成/轮换 */
    @PostMapping("/api/admin/student-mobile-token/generate")
    @Operation(summary = "生成或轮换免登录码（旧码立即失效）")
    public Result<Map<String, Object>> generateToken(@RequestBody Map<String, Object> body,
                                                     HttpServletRequest request) {
        return generateTokenForUser(body, request);
    }

    /** 扫码端生成/轮换 */
    @PostMapping("/api/scan/student-mobile-token/generate")
    @Operation(summary = "扫码端为被扫人生成或轮换免登录码")
    public Result<Map<String, Object>> generateScanToken(@RequestBody Map<String, Object> body,
                                                         HttpServletRequest request) {
        return generateTokenForUser(body, request);
    }

    private Result<Map<String, Object>> getTokenInfoForUser(String userId, HttpServletRequest request) {
        User currentUser = authContextService.resolveUserFromBearer(request.getHeader("Authorization"));
        if (currentUser == null) {
            return Result.fail(401, "未登录");
        }
        if (!canManage(currentUser, userId)) {
            return Result.fail(403, "无权查看他人的免登录码");
        }
        StudentMobileToken record = tokenService.getActiveToken(userId);
        if (record == null) {
            return Result.success(Map.of("hasToken", false));
        }
        Map<String, Object> info = new LinkedHashMap<>();
        info.put("hasToken", true);
        info.put("token", record.getToken());
        info.put("expiresAt", record.getExpiresAt() != null ? record.getExpiresAt().toString() : null);
        info.put("createdAt", record.getCreatedAt() != null ? record.getCreatedAt().toString() : null);
        return Result.success(info);
    }

    private Result<Map<String, Object>> generateTokenForUser(Map<String, Object> body,
                                                            HttpServletRequest request) {
        User currentUser = authContextService.resolveUserFromBearer(request.getHeader("Authorization"));
        if (currentUser == null) {
            return Result.fail(401, "未登录");
        }
        Object rawUserId = body.get("userId");
        if (rawUserId == null) {
            return Result.fail(400, "userId 不能为空");
        }
        String userId = rawUserId.toString();
        if (!canManage(currentUser, userId)) {
            return Result.fail(403, "无权生成他人的免登录码");
        }

        String token = tokenService.generateToken(userId);
        StudentMobileToken record = tokenService.getActiveToken(userId);

        log.info("User {} rotated login code for userId={}", currentUser.getId(), userId);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("token", token);
        result.put("userId", userId);
        result.put("expiresAt", record != null && record.getExpiresAt() != null
                ? record.getExpiresAt().toString() : null);
        return Result.success(result);
    }

    /** 本人，或教职工及以上 */
    private boolean canManage(User currentUser, String targetUserId) {
        if (currentUser.getId() != null && currentUser.getId().equals(targetUserId)) {
            return true;
        }
        RoleEnum role = currentUser.getRole();
        return role != null && role.getLevel() >= RoleEnum.STAFF.getLevel();
    }
}
