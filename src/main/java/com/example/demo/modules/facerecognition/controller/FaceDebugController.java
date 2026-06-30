package com.example.demo.modules.facerecognition.controller;

import com.example.demo.common.config.ApiAuthInterceptor;
import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.facerecognition.entity.FaceDebugPhoto;
import com.example.demo.modules.facerecognition.service.FaceAuthConfigService;
import com.example.demo.modules.facerecognition.service.FaceCompareService;
import com.example.demo.modules.facerecognition.service.FaceDebugService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/face/debug")
@Tag(name = "人脸识别调试", description = "调试用照片上传与比对")
public class FaceDebugController {

    private static final Logger log = LoggerFactory.getLogger(FaceDebugController.class);

    private final FaceDebugService debugService;
    private final FaceCompareService faceCompareService;
    private final FaceAuthConfigService configService;

    public FaceDebugController(FaceDebugService debugService,
                               FaceCompareService faceCompareService,
                               FaceAuthConfigService configService) {
        this.debugService = debugService;
        this.faceCompareService = faceCompareService;
        this.configService = configService;
    }

    @PostMapping("/upload")
    @Operation(summary = "上传调试照片")
    public Result<Map<String, Object>> upload(
            @RequestParam("file") MultipartFile file,
            @RequestParam(value = "label", required = false) String label,
            HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.ADMIN);
        if (denied != null) return Result.error(denied.getMessage());
        FaceDebugPhoto photo = debugService.upload(label, file);
        Map<String, Object> data = new HashMap<>();
        data.put("id", photo.getId());
        data.put("label", photo.getLabel());
        data.put("url", photo.getPublicUrl());
        return Result.success(data);
    }

    @GetMapping("/photos")
    @Operation(summary = "列出所有调试照片")
    public Result<List<FaceDebugPhoto>> listPhotos(HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.ADMIN);
        if (denied != null) return Result.error(denied.getMessage());
        return Result.success(debugService.listAll());
    }

    @DeleteMapping("/photos/{id}")
    @Operation(summary = "删除调试照片")
    public Result<Void> deletePhoto(@PathVariable Long id, HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.ADMIN);
        if (denied != null) return Result.error(denied.getMessage());
        debugService.delete(id);
        return Result.success(null);
    }

    @PostMapping("/compare")
    @Operation(summary = "后端比对两张照片")
    public Result<java.util.Map<String, Object>> compare(
            @RequestParam String url1,
            @RequestParam String url2,
            HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.STAFF);
        if (denied != null) return Result.error(denied.getMessage());
        try {
            double sim = faceCompareService.compare(url1, url2);
            double matchThreshold = configService.getVerifyMatchThreshold();
            java.util.Map<String, Object> data = new java.util.HashMap<>();
            data.put("similarity", sim);
            data.put("matchThreshold", matchThreshold);
            data.put("modelVersion", FaceCompareService.MODEL_VERSION);
            data.put("matched", sim >= matchThreshold);
            return Result.success(data);
        } catch (Exception e) {
            log.error("比对失败", e);
            return Result.error("比对失败: " + e.getMessage());
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
