package com.example.demo.modules.dahua.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.dahua.service.NvrPlaybackService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.util.Map;

/**
 * 录像机回放：检索某天的录像段、生成可播放片段。
 * 与实时预览一样，只给超管；录像机口令只在服务端。
 */
@RestController
@RequestMapping("/api/v1/dahua/playback")
@Tag(name = "录像回放", description = "按通道和时间检索/导出录像机录像")
public class NvrPlaybackController {

    private final NvrPlaybackService playbackService;
    private final AuthContextService authContextService;

    public NvrPlaybackController(NvrPlaybackService playbackService,
                                 AuthContextService authContextService) {
        this.playbackService = playbackService;
        this.authContextService = authContextService;
    }

    @GetMapping("/segments")
    @Operation(summary = "某通道某天的录像段（仅超级管理员）")
    public Result<?> segments(@RequestHeader(value = "Authorization", required = false) String authorization,
                              @RequestParam String channelCode,
                              @RequestParam String date) {
        Result<?> denied = requireSuperAdmin(authorization);
        if (denied != null) return denied;
        return Result.success(playbackService.segments(channelCode, LocalDate.parse(date)));
    }

    @PostMapping("/chunk")
    @Operation(summary = "生成一段可播放录像（仅超级管理员）")
    public Result<?> chunk(@RequestHeader(value = "Authorization", required = false) String authorization,
                           @RequestBody Map<String, Object> body) {
        Result<?> denied = requireSuperAdmin(authorization);
        if (denied != null) return denied;
        String channelCode = body.get("channelCode") == null ? null : String.valueOf(body.get("channelCode"));
        String startTime = body.get("startTime") == null ? null : String.valueOf(body.get("startTime"));
        Integer seconds = body.get("seconds") == null ? null : Integer.valueOf(String.valueOf(body.get("seconds")));
        return Result.success(playbackService.startChunk(channelCode, startTime, seconds));
    }

    @GetMapping("/chunk/{jobId}")
    @Operation(summary = "查询回放片段生成状态（仅超级管理员）")
    public Result<?> status(@RequestHeader(value = "Authorization", required = false) String authorization,
                            @PathVariable String jobId) {
        Result<?> denied = requireSuperAdmin(authorization);
        if (denied != null) return denied;
        return Result.success(playbackService.status(jobId));
    }

    @GetMapping("/chunk/{jobId}/file")
    @Operation(summary = "下载回放片段（仅超级管理员）")
    public ResponseEntity<Resource> file(@RequestHeader(value = "Authorization", required = false) String authorization,
                                         @PathVariable String jobId) throws Exception {
        if (requireSuperAdmin(authorization) != null) {
            return ResponseEntity.status(403).build();
        }
        Path path = playbackService.file(jobId);
        FileSystemResource resource = new FileSystemResource(path);
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType("video/mp4"))
                .contentLength(Files.size(path))
                .header(HttpHeaders.CACHE_CONTROL, "private, max-age=300")
                .body(resource);
    }

    private Result<?> requireSuperAdmin(String authorization) {
        User user = authContextService.resolveUserFromBearer(authorization);
        if (user == null) return Result.fail(401, "未登录或令牌无效");
        if (user.getStatus() != null && user.getStatus() == 0) return Result.fail(403, "账号已禁用");
        RoleEnum role = user.getRole() != null ? user.getRole() : RoleEnum.MEMBER;
        if (role.getLevel() < RoleEnum.SUPER_ADMIN.getLevel()) {
            return Result.fail(403, "仅超级管理员可查看录像回放");
        }
        return null;
    }
}
