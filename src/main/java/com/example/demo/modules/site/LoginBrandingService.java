package com.example.demo.modules.site;

import com.example.demo.modules.notification.service.NotificationSettingsService;
import com.example.demo.modules.site.dto.LoginBrandingVo;
import com.example.demo.modules.upload.service.UploadFileStorageService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.BadSqlGrammarException;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import java.net.URI;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class LoginBrandingService {

    private static final Logger log = LoggerFactory.getLogger(LoginBrandingService.class);

    private static final String MISSING_TABLE_HINT =
            "数据库未建 sys_site_config 表，请在目标库执行 scripts/login_branding_invite_chat.ddl.sql（说明见 scripts/DEPLOY_DDL.md）。";

    private static final Set<String> ALLOWED_EXT = new HashSet<>(Arrays.asList("jpg", "jpeg", "png", "webp", "gif"));

    private final SiteConfigJdbcRepository repo;
    private final LoginBrandingUploadStorage storage;
    private final UploadFileStorageService uploadFileStorageService;
    private final NotificationSettingsService notificationSettingsService;
    private final ObjectMapper objectMapper;
    private final long maxBytes;

    @Value("${app.public-base-url:}")
    private String appPublicBaseUrl;

    public LoginBrandingService(
            SiteConfigJdbcRepository repo,
            LoginBrandingUploadStorage storage,
            UploadFileStorageService uploadFileStorageService,
            NotificationSettingsService notificationSettingsService,
            ObjectMapper objectMapper,
            @org.springframework.beans.factory.annotation.Value("${app.login-branding.max-bytes:12582912}") long maxBytes
    ) {
        this.repo = repo;
        this.storage = storage;
        this.uploadFileStorageService = uploadFileStorageService;
        this.notificationSettingsService = notificationSettingsService;
        this.objectMapper = objectMapper;
        this.maxBytes = Math.max(1024, maxBytes);
    }

    public LoginBrandingVo loadForPublic() {
        try {
            LoginBrandingVo vo = normalize(readRaw());
            fillDisplayUrls(vo);
            return vo;
        } catch (BadSqlGrammarException ex) {
            log.warn("[login-branding] sys_site_config 不可用: {}", ex.getMessage());
            LoginBrandingVo vo = normalize(new LoginBrandingVo());
            fillDisplayUrls(vo);
            return vo;
        }
    }

    public LoginBrandingVo save(LoginBrandingVo body) throws Exception {
        LoginBrandingVo normalized = normalize(body == null ? new LoginBrandingVo() : body);
        String json = objectMapper.writeValueAsString(normalized);
        try {
            repo.upsertLoginBrandingJson(json);
        } catch (BadSqlGrammarException ex) {
            log.warn("[login-branding] 写入失败: {}", ex.getMessage());
            throw new IllegalArgumentException(MISSING_TABLE_HINT);
        }
        return normalized;
    }

    public Map<String, Object> uploadImage(MultipartFile file) throws Exception {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("文件为空");
        }
        if (file.getSize() > maxBytes) {
            throw new IllegalArgumentException("文件超过大小上限（" + maxBytes + " 字节）");
        }
        String original = file.getOriginalFilename();
        if (!StringUtils.hasText(original)) {
            original = "upload.jpg";
        }
        String ext = extensionOf(original);
        if (ext.isEmpty() || !ALLOWED_EXT.contains(ext)) {
            throw new IllegalArgumentException("不允许的文件类型，仅支持：" + String.join(", ", ALLOWED_EXT));
        }
        UploadFileStorageService.StoredUploadFile stored =
                uploadFileStorageService.store(file, "LOGIN_BRANDING");
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("url", stored.url());
        data.put("publicUrl", stored.publicUrl());
        data.put("recordId", stored.recordId());
        return data;
    }

    public Path resolveFileForDownload(String fileName) {
        return storage.resolveSafe(fileName);
    }

    /** 公开接口：为小程序填充绝对 HTTPS 展示 URL（相对路径无法被 `<image>` 加载） */
    private void fillDisplayUrls(LoginBrandingVo vo) {
        if (vo == null) {
            return;
        }
        vo.setHeroImageUrlsLightDisplay(resolveDisplayUrls(vo.getHeroImageUrlsLight()));
        vo.setHeroImageUrlsDarkDisplay(resolveDisplayUrls(vo.getHeroImageUrlsDark()));
    }

    private List<String> resolveDisplayUrls(List<String> raw) {
        if (raw == null || raw.isEmpty()) {
            return new ArrayList<>();
        }
        return raw.stream()
                .map(this::resolveSingleDisplayUrl)
                .filter(StringUtils::hasText)
                .collect(Collectors.toCollection(ArrayList::new));
    }

    private String resolveSingleDisplayUrl(String raw) {
        if (!StringUtils.hasText(raw)) {
            return "";
        }
        String u = raw.trim();
        if (u.startsWith("cloud://")) {
            return u;
        }
        if (u.matches("(?i)^https?://.*")) {
            return u;
        }
        String origin = resolvePublicOrigin();
        if (!StringUtils.hasText(origin)) {
            return "";
        }
        String path = u.startsWith("/") ? u : "/" + u;
        if (path.startsWith("/api/public/login-branding/files/")) {
            return origin + path;
        }
        if (path.startsWith("/api/upload/files/")) {
            return origin + path;
        }
        if (path.startsWith("/api/")) {
            return origin + path;
        }
        return "";
    }

    private String resolvePublicOrigin() {
        String configured = appPublicBaseUrl == null ? "" : appPublicBaseUrl.trim();
        if (StringUtils.hasText(configured) && configured.matches("(?i)^https?://.*")) {
            return configured.replaceAll("/+$", "");
        }
        try {
            Map<String, String> cfg = notificationSettingsService.getPublicRuntimeConfig();
            String uploadBase = cfg.getOrDefault("network.upload.publicBaseUrl", "").trim();
            if (StringUtils.hasText(uploadBase) && uploadBase.matches("(?i)^https?://.*")) {
                return uploadBase.replaceAll("/+$", "");
            }
            String apiBase = cfg.getOrDefault("network.frontend.apiBaseUrl", "").trim();
            if (StringUtils.hasText(apiBase) && apiBase.matches("(?i)^https?://.*")) {
                URI uri = URI.create(apiBase.replaceAll("/+$", ""));
                if (uri.getScheme() != null && uri.getAuthority() != null) {
                    return uri.getScheme() + "://" + uri.getAuthority();
                }
            }
        } catch (Exception ex) {
            log.debug("[login-branding] 读取 network 公网基址失败: {}", ex.getMessage());
        }
        return "";
    }

    private LoginBrandingVo readRaw() {
        return repo.findLoginBrandingJson()
                .map(json -> {
                    try {
                        LoginBrandingVo vo = objectMapper.readValue(json, LoginBrandingVo.class);
                        return vo == null ? new LoginBrandingVo() : vo;
                    } catch (Exception e) {
                        log.warn("[login-branding] JSON 解析失败，使用默认: {}", e.getMessage());
                        return new LoginBrandingVo();
                    }
                })
                .orElseGet(LoginBrandingVo::new);
    }

    static LoginBrandingVo normalize(LoginBrandingVo in) {
        LoginBrandingVo out = new LoginBrandingVo();
        List<String> legacy = sanitizeUrls(in.getHeroImageUrls());
        List<String> light = sanitizeUrls(in.getHeroImageUrlsLight());
        List<String> dark = sanitizeUrls(in.getHeroImageUrlsDark());
        if (light.isEmpty() && !legacy.isEmpty()) {
            light = legacy;
        }
        out.setHeroImageUrlsLight(light);
        out.setHeroImageUrlsDark(dark);
        out.setHeroImageUrls(new ArrayList<>(light));
        out.setIntervalSec(Math.max(3, in.getIntervalSec() <= 0 ? 8 : in.getIntervalSec()));
        out.setHeroCarouselEnabled(in.isHeroCarouselEnabled());
        return out;
    }

    private static List<String> sanitizeUrls(List<String> raw) {
        if (raw == null) {
            return new ArrayList<>();
        }
        return raw.stream()
                .map(u -> u == null ? "" : u.trim())
                .filter(StringUtils::hasText)
                .collect(Collectors.toCollection(ArrayList::new));
    }

    private static String extensionOf(String name) {
        int dot = name.lastIndexOf('.');
        if (dot < 0 || dot == name.length() - 1) {
            return "";
        }
        return name.substring(dot + 1).toLowerCase();
    }
}
