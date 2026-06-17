package com.example.demo.modules.facerecognition.controller;

import com.example.demo.common.config.ApiAuthInterceptor;
import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.facerecognition.entity.FaceBaselineRecord;
import com.example.demo.modules.facerecognition.service.FaceBaselineService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.InputStream;
import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/face/baseline")
@Tag(name = "人脸底库管理", description = "人员底库照片 CRUD（支持一人多张）")
public class FaceBaselineController {

    private static final Logger log = LoggerFactory.getLogger(FaceBaselineController.class);

    private final FaceBaselineService baselineService;

    public FaceBaselineController(FaceBaselineService baselineService) {
        this.baselineService = baselineService;
    }

    @GetMapping("/{userId}")
    @Operation(summary = "获取人员全部底库照片（含 id）")
    public Result<Map<String, Object>> getBaselines(@PathVariable String userId) {
        List<FaceBaselineRecord> records = baselineService.getAllByUserId(userId);
        List<Map<String, Object>> photos = records.stream().map(r -> {
            Map<String, Object> p = new HashMap<>();
            p.put("id", r.getId());
            p.put("url", r.getFaceImageUrl());
            return p;
        }).collect(Collectors.toList());
        Map<String, Object> data = new HashMap<>();
        data.put("userId", userId);
        data.put("photos", photos);
        data.put("urls", records.stream().map(FaceBaselineRecord::getFaceImageUrl).collect(Collectors.toList()));
        data.put("url", records.isEmpty() ? null : records.get(0).getFaceImageUrl());
        data.put("hasBaseline", !records.isEmpty());
        data.put("count", records.size());
        return Result.success(data);
    }

    @PostMapping("/upload")
    @Operation(summary = "添加底库照片（支持多次调用，一人多张）")
    public Result<Map<String, Object>> upload(
            @RequestParam("userId") String userId,
            @RequestParam("file") MultipartFile file,
            HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.STAFF);
        if (denied != null) return Result.error(denied.getMessage());
        FaceBaselineRecord record = baselineService.upload(userId, file);
        Map<String, Object> data = new HashMap<>();
        data.put("id", record.getId());
        data.put("userId", record.getUserId());
        data.put("url", record.getFaceImageUrl());
        return Result.success(data);
    }

    @DeleteMapping("/{userId}")
    @Operation(summary = "删除某人的全部底库照片")
    public Result<Void> deleteAllBaselines(@PathVariable String userId, HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.STAFF);
        if (denied != null) return Result.error(denied.getMessage());
        baselineService.deleteByUserId(userId);
        return Result.success(null);
    }

    @DeleteMapping("/{userId}/{id}")
    @Operation(summary = "删除单张底库照片")
    public Result<Void> deleteBaselineById(@PathVariable String userId, @PathVariable Long id,
                                            HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.STAFF);
        if (denied != null) return Result.error(denied.getMessage());
        baselineService.deleteById(id);
        return Result.success(null);
    }

    @GetMapping("/proxy-image")
    @Operation(summary = "代理外部图片（解决 CORS），返回图片字节流")
    public void proxyImage(@RequestParam String url, jakarta.servlet.http.HttpServletResponse response) {
        try {
            URI uri = URI.create(url);
            try (InputStream in = uri.toURL().openStream()) {
                response.setContentType("image/jpeg");
                response.setHeader("Cache-Control", "public, max-age=3600");
                response.setHeader("Access-Control-Allow-Origin", "*");
                response.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
                in.transferTo(response.getOutputStream());
            }
        } catch (Exception e) {
            log.warn("[face-proxy] 代理图片失败 url={}: {}", url, e.getMessage());
            response.setStatus(404);
        }
    }

    private Result<?> requireMinRole(HttpServletRequest request, RoleEnum minRole) {
        Object attr = request.getAttribute(ApiAuthInterceptor.CURRENT_USER_ATTR);
        if (!(attr instanceof User currentUser)) {
            return Result.error("未登录或 Token 无效");
        }
        RoleEnum currentRole = currentUser.getRole() == null ? RoleEnum.STUDENT : currentUser.getRole();
        if (currentRole.getLevel() < minRole.getLevel()) {
            return Result.error("无权限访问");
        }
        return null;
    }
}
