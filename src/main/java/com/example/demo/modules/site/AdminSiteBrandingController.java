package com.example.demo.modules.site;

import com.example.demo.common.config.AdminAuthInterceptor;
import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.auth.entity.User;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.util.StringUtils;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/admin/site")
@Tag(name = "管理端-站点外观", description = "登录页品牌化等")
public class AdminSiteBrandingController {

    private final SiteBrandingService siteBrandingService;
    private final LoginBrandingUploadService loginBrandingUploadService;

    public AdminSiteBrandingController(SiteBrandingService siteBrandingService,
                                       LoginBrandingUploadService loginBrandingUploadService) {
        this.siteBrandingService = siteBrandingService;
        this.loginBrandingUploadService = loginBrandingUploadService;
    }

    @GetMapping("/login-branding")
    @Operation(summary = "读取登录页品牌化配置")
    public Result<?> getLoginBranding(HttpServletRequest request) {
        Result<?> denied = requireAdmin(request);
        if (denied != null) {
            return denied;
        }
        return Result.success(siteBrandingService.getLoginBrandingPublic());
    }

    @PutMapping("/login-branding")
    @Operation(summary = "更新登录页轮播图 URL 列表")
    public Result<?> putLoginBranding(@RequestBody Map<String, Object> body, HttpServletRequest request) throws Exception {
        Result<?> denied = requireAdmin(request);
        if (denied != null) {
            return denied;
        }
        Object raw = body.get("heroImageUrls");
        if (!(raw instanceof List<?> list)) {
            return Result.error("heroImageUrls 须为字符串数组");
        }
        List<String> urls = list.stream().filter(o -> o != null).map(Object::toString).filter(StringUtils::hasText).toList();
        Integer interval = null;
        if (body.get("intervalSec") instanceof Number n) {
            interval = n.intValue();
        }
        Boolean heroCarouselEnabled = null;
        Object ce = body.get("heroCarouselEnabled");
        if (ce instanceof Boolean b) {
            heroCarouselEnabled = b;
        } else if (ce instanceof Number n) {
            heroCarouselEnabled = n.intValue() != 0;
        } else if (ce != null) {
            heroCarouselEnabled = Boolean.parseBoolean(ce.toString());
        }
        siteBrandingService.upsertLoginBranding(urls, interval, heroCarouselEnabled);
        return Result.success(siteBrandingService.getLoginBrandingPublic());
    }

    @PostMapping(value = "/login-branding/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(summary = "上传登录页轮播图（落盘可写目录，返回可写入 URL 列表的相对路径）")
    public Result<Map<String, String>> uploadLoginBrandingImage(
            @RequestParam("file") MultipartFile file,
            HttpServletRequest request
    ) {
        Result<?> denied = requireAdmin(request);
        if (denied != null) {
            return Result.error(denied.getMessage());
        }
        try {
            String url = loginBrandingUploadService.store(file);
            return Result.success(Map.of("url", url));
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        } catch (IOException e) {
            return Result.error("保存失败: " + e.getMessage());
        }
    }

    private Result<?> requireAdmin(HttpServletRequest request) {
        Object attr = request.getAttribute(AdminAuthInterceptor.CURRENT_ADMIN_USER_ATTR);
        if (!(attr instanceof User u)) {
            return Result.error("当前登录信息无效");
        }
        RoleEnum r = u.getRole() == null ? RoleEnum.STUDENT : u.getRole();
        if (r.getLevel() < RoleEnum.ADMIN.getLevel()) {
            return Result.error("无权限访问");
        }
        return null;
    }
}
