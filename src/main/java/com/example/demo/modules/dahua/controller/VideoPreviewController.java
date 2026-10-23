package com.example.demo.modules.dahua.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.dahua.service.VideoPreviewService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * 实时监控预览：前端按通道起一路流。
 * 页面入口只给超管，接口这里再做一层校验，防止绕过页面直接调用。
 */
@RestController
@RequestMapping("/api/v1/dahua/preview")
@Tag(name = "视频预览", description = "按设备通道拉取实时画面（HLS）")
public class VideoPreviewController {

    private final VideoPreviewService previewService;
    private final AuthContextService authContextService;

    public VideoPreviewController(VideoPreviewService previewService,
                                  AuthContextService authContextService) {
        this.previewService = previewService;
        this.authContextService = authContextService;
    }

    @PostMapping("/start")
    @Operation(summary = "开始一路预览（仅超级管理员）")
    public Result<?> start(@RequestHeader(value = "Authorization", required = false) String authorization,
                           @RequestBody Map<String, String> body) {
        Result<?> denied = requireSuperAdmin(authorization);
        if (denied != null) return denied;
        return Result.success(previewService.start(
                body.get("channelCode"),
                body.getOrDefault("streamType", "sub")
        ));
    }

    @PostMapping("/stop")
    @Operation(summary = "停止一路预览（仅超级管理员）")
    public Result<?> stop(@RequestHeader(value = "Authorization", required = false) String authorization,
                          @RequestBody Map<String, String> body) {
        Result<?> denied = requireSuperAdmin(authorization);
        if (denied != null) return denied;
        previewService.stop(body.get("sessionId"));
        return Result.success();
    }

    @GetMapping("/active")
    @Operation(summary = "当前预览占用（仅超级管理员）")
    public Result<?> active(@RequestHeader(value = "Authorization", required = false) String authorization) {
        Result<?> denied = requireSuperAdmin(authorization);
        if (denied != null) return denied;
        return Result.success(previewService.active());
    }

    @GetMapping("/hls/{sessionId}/{file:.+}")
    @Operation(summary = "HLS 播放列表与切片（仅超级管理员）")
    public ResponseEntity<byte[]> hls(@RequestHeader(value = "Authorization", required = false) String authorization,
                                      @PathVariable String sessionId,
                                      @PathVariable String file) {
        if (requireSuperAdmin(authorization) != null) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        VideoPreviewService.HlsFile media = previewService.readFile(sessionId, file);
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(media.contentType()))
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .body(media.data());
    }

    private Result<?> requireSuperAdmin(String authorization) {
        User user = authContextService.resolveUserFromBearer(authorization);
        if (user == null) return Result.fail(401, "未登录或令牌无效");
        if (user.getStatus() != null && user.getStatus() == 0) return Result.fail(403, "账号已禁用");
        RoleEnum role = user.getRole() != null ? user.getRole() : RoleEnum.MEMBER;
        if (role.getLevel() < RoleEnum.SUPER_ADMIN.getLevel()) {
            return Result.fail(403, "仅超级管理员可操作实时预览");
        }
        return null;
    }
}
