package com.example.demo.modules.site;

import com.example.demo.common.dto.Result;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.concurrent.TimeUnit;

@RestController
@RequestMapping("/api/public")
@Tag(name = "公开站点", description = "无需登录的站点配置")
public class PublicSiteController {

    private final SiteBrandingService siteBrandingService;
    private final LoginBrandingUploadService loginBrandingUploadService;

    public PublicSiteController(SiteBrandingService siteBrandingService,
                                LoginBrandingUploadService loginBrandingUploadService) {
        this.siteBrandingService = siteBrandingService;
        this.loginBrandingUploadService = loginBrandingUploadService;
    }

    @GetMapping("/login-branding")
    @Operation(summary = "登录页轮播图等配置")
    public Result<Map<String, Object>> loginBranding() {
        return Result.success(siteBrandingService.getLoginBrandingPublic());
    }

    @GetMapping("/login-branding/files/{fileName}")
    @Operation(summary = "登录轮播图静态文件（上传落盘）")
    public ResponseEntity<Resource> loginBrandingFile(@PathVariable("fileName") String fileName) throws Exception {
        if (!LoginBrandingUploadService.isSafePublicFileName(fileName)) {
            return ResponseEntity.notFound().build();
        }
        Path base = loginBrandingUploadService.getUploadDir().normalize();
        Path target = base.resolve(fileName).normalize();
        if (!target.startsWith(base) || !Files.isRegularFile(target)) {
            return ResponseEntity.notFound().build();
        }
        Resource body = new FileSystemResource(target.toFile());
        String probed = Files.probeContentType(target);
        MediaType mt = MediaType.APPLICATION_OCTET_STREAM;
        if (probed != null) {
            try {
                mt = MediaType.parseMediaType(probed);
            } catch (Exception ignored) {
                // keep octet-stream
            }
        }
        return ResponseEntity.ok()
                .cacheControl(CacheControl.maxAge(7, TimeUnit.DAYS).cachePublic())
                .header(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=\"" + fileName + "\"")
                .contentType(mt)
                .body(body);
    }
}
