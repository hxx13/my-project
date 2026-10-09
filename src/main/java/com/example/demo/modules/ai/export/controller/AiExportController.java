package com.example.demo.modules.ai.export.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.ai.export.entity.AiExportArtifact;
import com.example.demo.modules.ai.export.service.AiExportArtifactService;
import com.example.demo.modules.ai.service.AiSessionService;
import com.example.demo.modules.auth.entity.User;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 对话导出产物的读写口（**载体无关**，与网关同属 {@code /api/v1/ai}）。
 *
 * <p>三件事：列一份会话的产物、把用户下到的那份字节交回来归档、以及下载。
 * 身份一律来自 JWT（不变量 I1），归属看产物上的产出人 —— 别人的产物**取不到也下不到**。
 *
 * <p><b>为什么不复用现成的两个文件区</b>（公开上传目录 / 文件模板库）：那两个都不按归属放行，
 * 导出的审计数据落进去等于对全站放开。产物字节留在自己的表里、走这里的卡。
 */
@RestController
@RequestMapping("/api/v1/ai")
@Tag(name = "AI 导出产物", description = "导出文件跟随对话：归档、历史回放、重复下载")
public class AiExportController {

    private final AiExportArtifactService artifactService;
    private final AiSessionService sessionService;
    private final AuthContextService authContextService;

    public AiExportController(AiExportArtifactService artifactService,
                              AiSessionService sessionService,
                              AuthContextService authContextService) {
        this.artifactService = artifactService;
        this.sessionService = sessionService;
        this.authContextService = authContextService;
    }

    /** 一份会话的全部产物（**不含字节**，只报 hasFile）。历史回放据此把卡片放回原位。 */
    @GetMapping("/sessions/{id}/exports")
    @Operation(summary = "会话的导出产物列表")
    public Result<List<Map<String, Object>>> list(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable Long id) {
        User user = currentUser(authorization);
        if (user == null) {
            return Result.error("未登录");
        }
        try {
            sessionService.requireOwned(id, user.getId());
        } catch (IllegalStateException e) {
            return Result.error(e.getMessage());
        }
        List<Map<String, Object>> out = new ArrayList<>();
        for (AiExportArtifact row : artifactService.listBySession(id)) {
            out.add(artifactService.describe(row));
        }
        return Result.success(out);
    }

    /**
     * 归档：用户点过下载、前端把那份字节交回来。
     *
     * <p>存的是**用户实际下到的那一份**，服务端不重算 —— 否则「历史里下到的」和「当时看到的」
     * 会因为配置或数据的时序差而对不上。
     */
    @PostMapping(value = "/exports/{id}/content", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(summary = "归档一份导出的文件字节")
    public Result<Map<String, Object>> archive(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable Long id,
            @RequestParam("file") MultipartFile file) {
        User user = currentUser(authorization);
        if (user == null) {
            return Result.error("未登录");
        }
        AiExportArtifact row;
        try {
            row = artifactService.requireOwned(id, user.getId());
        } catch (IllegalStateException e) {
            return Result.error(e.getMessage());
        }
        if (file == null || file.isEmpty()) {
            return Result.error("没有可归档的内容");
        }
        try {
            artifactService.saveContent(row.getId(), file.getBytes(),
                    file.getContentType() == null ? "application/octet-stream" : file.getContentType());
        } catch (Exception e) {
            return Result.error("归档失败：" + e.getMessage());
        }
        return Result.success(artifactService.describe(artifactService.requireOwned(id, user.getId())));
    }

    /**
     * 下载。
     *
     * <p>有字节就给字节（历史里再下与当时逐字节相同）；没字节（只是给过按钮、还没下过）
     * 返回 404 —— 载体据此回落到「用参数重跑一次导出」，那条路一直在。
     */
    @GetMapping("/exports/{id}/download")
    @Operation(summary = "下载产物文件")
    public ResponseEntity<byte[]> download(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable Long id) {
        User user = currentUser(authorization);
        if (user == null) {
            return ResponseEntity.status(401).build();
        }
        AiExportArtifact row;
        try {
            row = artifactService.requireOwned(id, user.getId());
        } catch (IllegalStateException e) {
            return ResponseEntity.notFound().build();
        }
        byte[] bytes = artifactService.contentOf(row);
        if (bytes == null) {
            return ResponseEntity.notFound().build();
        }
        String filename = row.getFilename() == null ? "export.xlsx" : row.getFilename();
        String encoded = URLEncoder.encode(filename, StandardCharsets.UTF_8).replace("+", "%20");
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename=\"" + encoded + "\"; filename*=UTF-8''" + encoded)
                .contentType(MediaType.parseMediaType(
                        row.getContentType() == null ? "application/octet-stream" : row.getContentType()))
                .body(bytes);
    }

    private User currentUser(String authorization) {
        return authContextService.resolveUserFromBearer(authorization);
    }
}
