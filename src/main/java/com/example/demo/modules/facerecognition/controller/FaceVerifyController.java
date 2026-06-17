package com.example.demo.modules.facerecognition.controller;

import com.example.demo.common.config.ApiAuthInterceptor;
import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.facerecognition.dto.FaceVerifyResultDTO;
import com.example.demo.modules.facerecognition.service.FaceVerifyService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.ArrayList;
import java.util.List;

@RestController
@RequestMapping("/api/face/verify")
@Tag(name = "人脸验证", description = "路线 B：服务端 1:1 比对")
public class FaceVerifyController {

    private final FaceVerifyService verifyService;

    public FaceVerifyController(FaceVerifyService verifyService) {
        this.verifyService = verifyService;
    }

    @PostMapping
    @Operation(summary = "上传抓拍帧，服务端与底库多张比对")
    public Result<FaceVerifyResultDTO> verify(
            @RequestParam String userId,
            @RequestParam(value = "sessionId", required = false) String sessionId,
            @RequestParam(value = "challengeAction", required = false) String challengeAction,
            @RequestParam(value = "source", required = false, defaultValue = "gate") String source,
            @RequestParam("frames") List<MultipartFile> frames,
            HttpServletRequest request) {
        Result<?> denied = requireLoggedIn(request);
        if (denied != null) return Result.error(denied.getMessage());

        List<byte[]> probeBytes = new ArrayList<>();
        for (MultipartFile f : frames) {
            if (f == null || f.isEmpty()) continue;
            try {
                probeBytes.add(f.getBytes());
            } catch (Exception e) {
                return Result.error("读取上传帧失败: " + e.getMessage());
            }
        }
        if (probeBytes.isEmpty()) {
            return Result.error("请上传至少一帧有效照片");
        }

        FaceVerifyResultDTO data = verifyService.verify(
                userId, sessionId, challengeAction, source, probeBytes);
        return Result.success(data);
    }

    private Result<?> requireLoggedIn(HttpServletRequest request) {
        Object attr = request.getAttribute(ApiAuthInterceptor.CURRENT_USER_ATTR);
        if (!(attr instanceof User)) {
            return Result.error("未登录或 Token 无效");
        }
        return null;
    }
}
