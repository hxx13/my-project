package com.example.demo.modules.site;

import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * 登录页轮播图：持久化到可写目录，通过 {@code /api/public/login-branding/files/} 公开读取（与 JAR 分离）。
 */
@Service
public class LoginBrandingUploadService {

    private static final Logger log = LoggerFactory.getLogger(LoginBrandingUploadService.class);

    /** 相对站点根的公开 URL 前缀（与 PublicSiteController 映射一致） */
    public static final String PUBLIC_URL_PREFIX = "/api/public/login-branding/files/";

    private static final Pattern SAFE_NAME = Pattern.compile("^[a-f0-9]{32}\\.(jpg|png|gif|webp)$");

    private static final Set<String> ALLOWED_EXT = Set.of("jpg", "png", "gif", "webp");

    private final Path uploadDir;

    public LoginBrandingUploadService(
            @Value("${app.login-branding.upload-dir:${user.home}/.twin-system/login-branding-uploads}") String uploadDirProp
    ) {
        this.uploadDir = Path.of(uploadDirProp).toAbsolutePath().normalize();
    }

    @PostConstruct
    public void ensureDir() {
        try {
            Files.createDirectories(uploadDir);
            log.info("[login-branding-upload] 目录就绪: {}", uploadDir);
        } catch (IOException e) {
            throw new IllegalStateException("无法创建登录轮播图上传目录: " + uploadDir, e);
        }
    }

    public Path getUploadDir() {
        return uploadDir;
    }

    /**
     * 保存上传文件，返回可写入 sys_site_config 的相对 URL（同域 /api/public/...）。
     */
    public String store(MultipartFile file) throws IOException {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("请选择图片文件");
        }
        String orig = file.getOriginalFilename();
        String ext = resolveExtension(orig);
        if (!ALLOWED_EXT.contains(ext)) {
            throw new IllegalArgumentException("仅支持 jpg、jpeg、png、gif、webp");
        }
        long max = 12L * 1024 * 1024;
        if (file.getSize() > max) {
            throw new IllegalArgumentException("单张图片不超过 12MB");
        }
        String name = UUID.randomUUID().toString().replace("-", "") + "." + ext;
        Path target = uploadDir.resolve(name).normalize();
        if (!target.startsWith(uploadDir)) {
            throw new IllegalStateException("非法路径");
        }
        try (InputStream in = file.getInputStream()) {
            Files.copy(in, target, StandardCopyOption.REPLACE_EXISTING);
        }
        return PUBLIC_URL_PREFIX + name;
    }

    public static boolean isSafePublicFileName(String fileName) {
        return fileName != null && SAFE_NAME.matcher(fileName).matches();
    }

    private static String resolveExtension(String originalFilename) {
        if (!StringUtils.hasText(originalFilename) || !originalFilename.contains(".")) {
            return "";
        }
        String raw = originalFilename.substring(originalFilename.lastIndexOf('.') + 1).trim().toLowerCase(Locale.ROOT);
        if ("jpeg".equals(raw) || "jpe".equals(raw)) {
            return "jpg";
        }
        return raw;
    }
}
