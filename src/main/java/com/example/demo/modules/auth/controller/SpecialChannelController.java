package com.example.demo.modules.auth.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.exception.ErrorCodeConstants;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.dto.PinStatusResponse;
import com.example.demo.modules.auth.dto.SetPinRequest;
import com.example.demo.modules.auth.dto.SpecialChannelLoginRequest;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.auth.service.SpecialChannelService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth/special-channel")
@Tag(name = "特殊通道", description = "学生刷卡弹窗 PIN 认证入口")
public class SpecialChannelController {

    private final SpecialChannelService specialChannelService;
    private final AuthContextService authContextService;

    public SpecialChannelController(SpecialChannelService specialChannelService,
                                     AuthContextService authContextService) {
        this.specialChannelService = specialChannelService;
        this.authContextService = authContextService;
    }

    @GetMapping("/pin-status")
    @Operation(summary = "查询 PIN 是否已设置")
    public Result<PinStatusResponse> checkPinStatus(@RequestParam String userId) {
        boolean hasPin = specialChannelService.hasPin(userId);
        return Result.success(PinStatusResponse.of(hasPin));
    }

    @PostMapping("/set-pin")
    @Operation(summary = "首次设置个人密码（设置成功直接签发 JWT）")
    public Result<?> setPin(@RequestBody SetPinRequest request) {
        if (request == null || request.getUserId() == null || request.getPin() == null) {
            return Result.fail(ErrorCodeConstants.BAD_REQUEST, "参数不完整");
        }
        return Result.success(specialChannelService.setPin(request.getUserId().trim(), request.getPin().trim()));
    }

    @PostMapping("/login")
    @Operation(summary = "PIN 验证登录（或 faceVerified=true 人脸验证登录）")
    public Result<?> login(@RequestBody SpecialChannelLoginRequest request) {
        if (request == null || request.getUserId() == null) {
            return Result.fail(ErrorCodeConstants.BAD_REQUEST, "参数不完整");
        }
        if (!Boolean.TRUE.equals(request.getFaceVerified())
                && (request.getPin() == null || request.getPin().isBlank())) {
            return Result.fail(ErrorCodeConstants.BAD_REQUEST, "参数不完整");
        }
        return Result.success(specialChannelService.login(
                request.getUserId().trim(),
                request.getPin() != null ? request.getPin().trim() : null,
                request.getFaceVerified()));
    }

    @PostMapping("/admin/personnel/{userId}/reset-pin")
    @Operation(summary = "管理员重置学生个人密码（SUPER_ADMIN；userId 须为人员库学号）")
    public Result<?> resetPin(@PathVariable String userId, HttpServletRequest request) {
        User me = authContextService.resolveUserFromBearer(request.getHeader("Authorization"));
        if (me == null) {
            return Result.fail(ErrorCodeConstants.UNAUTHORIZED, "未登录");
        }
        if (me.getRole() == null || me.getRole().getLevel() < RoleEnum.SUPER_ADMIN.getLevel()) {
            return Result.fail(ErrorCodeConstants.FORBIDDEN, "需要超级管理员权限");
        }
        specialChannelService.resetPin(userId.trim(), me.getId());
        return Result.success();
    }
}
