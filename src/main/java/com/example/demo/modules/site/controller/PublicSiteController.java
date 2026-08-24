package com.example.demo.modules.site.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.modules.site.LoginBrandingService;
import com.example.demo.modules.site.SiteConfigJdbcRepository;
import com.example.demo.modules.site.dto.LoginBrandingVo;
import com.example.demo.modules.twin.common.mapper.TwinDashboardMapper;
import com.example.demo.modules.twin.dashboard.service.TwinDashboardService;
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
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/public")
@Tag(name = "公开站点", description = "登录页轮播等公开只读配置")
public class PublicSiteController {

    private final LoginBrandingService loginBrandingService;
    private final SiteConfigJdbcRepository siteConfigRepo;
    private final TwinDashboardService twinDashboardService;
    private final TwinDashboardMapper dashboardMapper;
    private final ObjectMapper objectMapper;

    public PublicSiteController(
            LoginBrandingService loginBrandingService,
            SiteConfigJdbcRepository siteConfigRepo,
            TwinDashboardService twinDashboardService,
            TwinDashboardMapper dashboardMapper,
            ObjectMapper objectMapper
    ) {
        this.loginBrandingService = loginBrandingService;
        this.siteConfigRepo = siteConfigRepo;
        this.twinDashboardService = twinDashboardService;
        this.dashboardMapper = dashboardMapper;
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

    @GetMapping("/portal-stats")
    @Operation(summary = "门户首页统计（公开）：累计进入 + 浦东/浦西今日人次 + 高峰曲线")
    public Result<Map<String, Object>> portalStats() {
        Map<String, Object> stats = new HashMap<>();
        stats.put("pudongTotal", 0);
        stats.put("puxiTotal", 0);
        stats.put("totalEnter", 0);

        // 今日浦东/浦西进入人次
        try {
            Map<String, Object> pie = twinDashboardService.getTodayRoomStats();
            if (pie != null) {
                stats.put("pudongTotal", pie.getOrDefault("pudongTotal", 0));
                stats.put("puxiTotal", pie.getOrDefault("puxiTotal", 0));
            }
        } catch (Exception ignored) {
            // 公开页降级为 0，不向外抛栈
        }

        // 进出高峰曲线（7:00–20:00 半小时桶）
        try {
            Map<String, Object> line = twinDashboardService.getTodayLineChart();
            if (line != null) {
                stats.put("lineChart", line);
            }
        } catch (Exception ignored) {
        }

        // 累计进入次数（全量 accessType=1）
        try {
            Map<String, Object> debug = dashboardMapper.getFilteredDebugStats(
                    null, null, null, null, null, null, null, true);
            if (debug != null) {
                stats.put("totalEnter", debug.getOrDefault("totalEnter", 0));
            }
        } catch (Exception ignored) {
        }

        return Result.success(stats);
    }
}
