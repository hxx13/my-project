package com.example.demo.modules.site.controller;

import com.example.demo.common.config.AdminAuthInterceptor;
import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.site.LoginBrandingService;
import com.example.demo.modules.site.SiteConfigJdbcRepository;
import com.example.demo.modules.site.dto.LoginBrandingVo;
import com.example.demo.modules.site.dto.PortalFooterVo;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.Map;

@RestController
@RequestMapping("/api/admin/site")
@Tag(name = "管理端-站点配置", description = "登录页轮播等品牌配置")
public class AdminSiteBrandingController {

    private final LoginBrandingService loginBrandingService;
    private final SiteConfigJdbcRepository siteConfigRepo;
    private final ObjectMapper objectMapper;

    public AdminSiteBrandingController(
            LoginBrandingService loginBrandingService,
            SiteConfigJdbcRepository siteConfigRepo,
            ObjectMapper objectMapper
    ) {
        this.loginBrandingService = loginBrandingService;
        this.siteConfigRepo = siteConfigRepo;
        this.objectMapper = objectMapper;
    }

    @GetMapping("/login-branding")
    @Operation(summary = "读取登录页轮播配置")
    public Result<LoginBrandingVo> get(HttpServletRequest request) {
        Result<?> denied = requireSettingsAdmin(request);
        if (denied != null) {
            return (Result<LoginBrandingVo>) denied;
        }
        return Result.success(loginBrandingService.loadForPublic());
    }

    @PutMapping("/login-branding")
    @Operation(summary = "保存登录页轮播配置")
    public Result<LoginBrandingVo> put(@RequestBody LoginBrandingVo body, HttpServletRequest request) throws Exception {
        Result<?> denied = requireSettingsAdmin(request);
        if (denied != null) {
            return (Result<LoginBrandingVo>) denied;
        }
        try {
            return Result.success(loginBrandingService.save(body));
        } catch (IllegalArgumentException ex) {
            return Result.error(ex.getMessage());
        }
    }

    @PostMapping("/login-branding/upload")
    @Operation(summary = "上传登录页轮播图片")
    public Result<Map<String, Object>> upload(
            @RequestParam("file") MultipartFile file,
            HttpServletRequest request
    ) {
        Result<?> denied = requireSettingsAdmin(request);
        if (denied != null) {
            return (Result<Map<String, Object>>) denied;
        }
        try {
            return Result.success(loginBrandingService.uploadImage(file));
        } catch (IllegalArgumentException ex) {
            return Result.error(ex.getMessage());
        } catch (Exception ex) {
            return Result.error(ex.getMessage() != null ? ex.getMessage() : "上传失败");
        }
    }

    /* ── Dashboard Preview config ── */

    @GetMapping("/dashboard-preview")
    @Operation(summary = "读取仪表盘预览配置")
    public Result<Map<String, Object>> getDashboardPreview(HttpServletRequest request) {
        Result<?> denied = requireSettingsAdmin(request);
        if (denied != null) {
            return (Result<Map<String, Object>>) denied;
        }
        try {
            String json = siteConfigRepo.findDashboardPreviewJson().orElse("{}");
            Map<String, Object> data = objectMapper.readValue(json, Map.class);
            return Result.success(data);
        } catch (Exception ex) {
            return Result.success(new java.util.LinkedHashMap<>());
        }
    }

    @PutMapping("/dashboard-preview")
    @Operation(summary = "保存仪表盘预览配置")
    public Result<Map<String, Object>> putDashboardPreview(
            @RequestBody Map<String, Object> body,
            HttpServletRequest request
    ) {
        Result<?> denied = requireSettingsAdmin(request);
        if (denied != null) {
            return (Result<Map<String, Object>>) denied;
        }
        try {
            String json = objectMapper.writeValueAsString(body == null ? new java.util.LinkedHashMap<>() : body);
            siteConfigRepo.upsertDashboardPreviewJson(json);
            return Result.success(body);
        } catch (Exception ex) {
            return Result.error(ex.getMessage() != null ? ex.getMessage() : "保存失败");
        }
    }

    /* ── Portal Footer config ── */

    @GetMapping("/portal-footer")
    @Operation(summary = "读取门户页脚配置")
    public Result<PortalFooterVo> getPortalFooter(HttpServletRequest request) {
        Result<?> denied = requireSettingsAdmin(request);
        if (denied != null) {
            return (Result<PortalFooterVo>) denied;
        }
        try {
            String json = siteConfigRepo.findPortalFooterJson().orElse("{}");
            PortalFooterVo vo = objectMapper.readValue(json, PortalFooterVo.class);
            return Result.success(vo != null ? vo : new PortalFooterVo());
        } catch (Exception ex) {
            return Result.success(new PortalFooterVo());
        }
    }

    @PutMapping("/portal-footer")
    @Operation(summary = "保存门户页脚配置")
    public Result<PortalFooterVo> putPortalFooter(
            @RequestBody PortalFooterVo body,
            HttpServletRequest request
    ) {
        Result<?> denied = requireSettingsAdmin(request);
        if (denied != null) {
            return (Result<PortalFooterVo>) denied;
        }
        try {
            PortalFooterVo vo = body != null ? body : new PortalFooterVo();
            String json = objectMapper.writeValueAsString(vo);
            siteConfigRepo.upsertPortalFooterJson(json);
            return Result.success(vo);
        } catch (Exception ex) {
            return Result.error(ex.getMessage() != null ? ex.getMessage() : "保存失败");
        }
    }

    private Result<?> requireSettingsAdmin(HttpServletRequest request) {
        User user = (User) request.getAttribute(AdminAuthInterceptor.CURRENT_ADMIN_USER_ATTR);
        if (user == null) {
            return Result.error("未登录或Token无效");
        }
        RoleEnum role = user.getRole() == null ? RoleEnum.MEMBER : user.getRole();
        if (role.getLevel() < RoleEnum.ADMIN.getLevel()) {
            return Result.error("无权限");
        }
        return null;
    }
}
