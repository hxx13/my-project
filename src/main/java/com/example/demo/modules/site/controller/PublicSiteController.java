package com.example.demo.modules.site.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.modules.site.LoginBrandingService;
import com.example.demo.modules.site.SiteConfigJdbcRepository;
import com.example.demo.modules.site.dto.LoginBrandingVo;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/public")
@Tag(name = "公开站点", description = "登录页轮播等公开只读配置")
public class PublicSiteController {

    private final LoginBrandingService loginBrandingService;
    private final SiteConfigJdbcRepository siteConfigRepo;
    private final ObjectMapper objectMapper;

    public PublicSiteController(
            LoginBrandingService loginBrandingService,
            SiteConfigJdbcRepository siteConfigRepo,
            ObjectMapper objectMapper
    ) {
        this.loginBrandingService = loginBrandingService;
        this.siteConfigRepo = siteConfigRepo;
        this.objectMapper = objectMapper;
    }

    @GetMapping("/login-branding")
    @Operation(summary = "登录页轮播配置（公开）")
    public Result<LoginBrandingVo> loginBranding() {
        return Result.success(loginBrandingService.loadForPublic());
    }

    @GetMapping("/dashboard-preview")
    @Operation(summary = "仪表盘预览配置（公开）")
    public Result<Map<String, Object>> dashboardPreview() {
        try {
            String json = siteConfigRepo.findDashboardPreviewJson().orElse("{}");
            Map<String, Object> data = objectMapper.readValue(json, Map.class);
            return Result.success(data);
        } catch (Exception ex) {
            return Result.success(new LinkedHashMap<>());
        }
    }

    @GetMapping("/login-branding/files/{fileName}")
    @Operation(summary = "登录页轮播上传图片（公开静态）")
    public ResponseEntity<Resource> loginBrandingFile(@PathVariable String fileName) {
        try {
            Path path = loginBrandingService.resolveFileForDownload(fileName);
            if (!Files.isRegularFile(path)) {
                return ResponseEntity.notFound().build();
            }
            MediaType mediaType = MediaType.APPLICATION_OCTET_STREAM;
            try {
                String probe = Files.probeContentType(path);
                if (probe != null) {
                    mediaType = MediaType.parseMediaType(probe);
                }
            } catch (IOException ignored) {
                // 探测失败仍返回文件
            }
            return ResponseEntity.ok().contentType(mediaType).body(new FileSystemResource(path));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().build();
        }
    }
}
