package com.example.demo.modules.upload.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.exception.ErrorCodeConstants;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.upload.entity.UploadFileRecord;
import com.example.demo.modules.upload.service.UploadFileRecordService;
import com.example.demo.modules.upload.service.UploadFileService;
import com.example.demo.modules.site.LoginBrandingService;
import com.example.demo.modules.upload.service.UploadFileStorageService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.File;
import java.io.InputStream;
import java.nio.file.StandardCopyOption;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;

@RestController
@RequestMapping("/api/upload")
@Tag(name = "文件上传", description = "上传文件与文件访问接口")
public class UploadController {
    private static final Logger log = LoggerFactory.getLogger(UploadController.class);
    private final AuthContextService authContextService;
    private final UploadFileService uploadFileService;
    private final UploadFileRecordService uploadFileRecordService;
    private final UploadFileStorageService uploadFileStorageService;
    private final LoginBrandingService loginBrandingService;
    private final JdbcTemplate jdbcTemplate;

    @Value("${app.public-base-url:}")
    private String publicBaseUrl;

    @Value("${app.upload.sync-secret:}")
    private String syncSecret;

    public UploadController(AuthContextService authContextService,
                            UploadFileService uploadFileService,
                            UploadFileRecordService uploadFileRecordService,
                            UploadFileStorageService uploadFileStorageService,
                            LoginBrandingService loginBrandingService,
                            JdbcTemplate jdbcTemplate) {
        this.authContextService = authContextService;
        this.uploadFileService = uploadFileService;
        this.uploadFileRecordService = uploadFileRecordService;
        this.uploadFileStorageService = uploadFileStorageService;
        this.loginBrandingService = loginBrandingService;
        this.jdbcTemplate = jdbcTemplate;
    }

    @PostMapping
    @Operation(summary = "上传文件")
    public Result<?> upload(@RequestHeader(value = "Authorization", required = false) String authorization,
                            @RequestParam("file") MultipartFile file) throws Exception {
        User user = authContextService.resolveUserFromBearer(authorization);
        if (user == null) {
            return Result.error("未登录或Token无效");
        }
        if (user.getStatus() != null && user.getStatus() == 0) {
            return Result.error("账号已禁用");
        }
        RoleEnum role = user.getRole() == null ? RoleEnum.MEMBER : user.getRole();
        if (role.getLevel() < RoleEnum.STAFF.getLevel()) {
            return Result.error("无权限上传文件");
        }
        if (file == null || file.isEmpty()) {
            return Result.error("文件不能为空");
        }

        try {
            UploadFileStorageService.StoredUploadFile stored =
                    uploadFileStorageService.store(file, "WEB");
            Map<String, Object> data = new HashMap<>();
            data.put("url", stored.url());
            data.put("publicUrl", stored.publicUrl());
            data.put("recordId", stored.recordId());
            return Result.success(data);
        } catch (IllegalArgumentException ex) {
            return Result.error(ex.getMessage());
        } catch (Exception ex) {
            return Result.error("上传失败: " + ex.getMessage());
        }
    }

    /**
     * 图片代理：把 cloud:// 或相对路径映射到磁盘文件并返回。
     * Web 端 img src 用此端点；小程序端可兜底用 publicUrl（HTTP 直连）。
     * 用法：GET /api/upload/proxy-image?url=cloud://xxx 或 ?url=/api/upload/files/...
     */
    @GetMapping("/proxy-image")
    @Operation(summary = "图片代理（cloud:// → 磁盘文件）")
    public ResponseEntity<Resource> proxyImage(
            @RequestParam("url") String url,
            jakarta.servlet.http.HttpServletRequest request) {
        if (!StringUtils.hasText(url)) {
            return ResponseEntity.badRequest().build();
        }

        try {
            // 1. 尝试通过 upload_file_record 的 wechat_file_id 查找
            UploadFileRecord record = uploadFileRecordService.findByWechatFileId(url);
            if (record != null && StringUtils.hasText(record.getStorageKey())) {
                File file = uploadFileService.resolveBaseDir().resolve(record.getStorageKey()).toFile();
                if (file.exists() && file.isFile()) {
                    Resource resource = new FileSystemResource(file);
                    MediaType mediaType = resolveMediaType(file.toPath());
                    return ResponseEntity.ok().contentType(mediaType).body(resource);
                }
            }

            // 2. 如果 url 本身就是 /api/upload/files/... 路径，直接读取
            if (url.startsWith("/api/upload/files/")) {
                String relativePath = url.substring("/api/upload/files/".length());
                if (relativePath.contains("..")) {
                    return ResponseEntity.badRequest().build();
                }
                File file = uploadFileService.resolveBaseDir().resolve(relativePath).toFile();
                if (file.exists() && file.isFile()) {
                    Resource resource = new FileSystemResource(file);
                    MediaType mediaType = resolveMediaType(file.toPath());
                    return ResponseEntity.ok().contentType(mediaType).body(resource);
                }
            }

            // 3. 登录页轮播旧链：/api/public/login-branding/files/{fileName}
            String loginBrandingFile = extractLoginBrandingFileName(url);
            if (loginBrandingFile != null) {
                try {
                    Path brandingPath = loginBrandingService.resolveFileForDownload(loginBrandingFile);
                    if (Files.isRegularFile(brandingPath)) {
                        Resource resource = new FileSystemResource(brandingPath);
                        MediaType mediaType = resolveMediaType(brandingPath);
                        return ResponseEntity.ok().contentType(mediaType).body(resource);
                    }
                } catch (IllegalArgumentException ignored) {
                    return ResponseEntity.badRequest().build();
                }
            }

            // 4. 未找到：返回占位 SVG，不报 404
            String svg = "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"80\" height=\"80\">"
                    + "<rect fill=\"#f1f5f9\" width=\"80\" height=\"80\" rx=\"4\"/>"
                    + "<text x=\"40\" y=\"42\" text-anchor=\"middle\" fill=\"#94a3b8\" font-size=\"10\" font-family=\"sans-serif\">未同步</text>"
                    + "</svg>";
            return ResponseEntity.ok().contentType(MediaType.valueOf("image/svg+xml"))
                    .body(new org.springframework.core.io.ByteArrayResource(svg.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
        } catch (Exception e) {
            log.error("proxy-image 失败: url={}, error={}", url, e.getMessage());
            return ResponseEntity.internalServerError().build();
        }
    }

    /** 公开访问的图片/媒体扩展名 */
    private static final Set<String> PUBLIC_EXTENSIONS = Set.of(
            "jpg", "jpeg", "png", "gif", "svg", "webp", "bmp", "ico"
    );

    @GetMapping("/files/**")
    @Operation(summary = "按路径读取文件")
    public ResponseEntity<Resource> getFile(jakarta.servlet.http.HttpServletRequest request) {
        String uri = request.getRequestURI();
        int idx = uri.indexOf("/api/upload/files/");
        if (idx < 0) {
            return ResponseEntity.notFound().build();
        }
        String relativePath = uri.substring(idx + "/api/upload/files/".length());
        if (!StringUtils.hasText(relativePath) || relativePath.contains("..")) {
            return ResponseEntity.badRequest().build();
        }

        // 非公开扩展名（文档/压缩包等）需要 JWT 认证
        String ext = extractExtension(relativePath);
        if (!PUBLIC_EXTENSIONS.contains(ext)) {
            String authHeader = request.getHeader("Authorization");
            User user = authContextService.resolveUserFromBearer(authHeader);
            if (user == null) {
                return ResponseEntity.status(401).build();
            }
        }

        File file = uploadFileService.resolveBaseDir().resolve(relativePath).toFile();
        if (!file.exists() || !file.isFile()) {
            return ResponseEntity.notFound().build();
        }
        Resource resource = new FileSystemResource(file);
        MediaType mediaType = resolveMediaType(file.toPath());

        var resp = ResponseEntity.ok()
                .cacheControl(CacheControl.maxAge(7, java.util.concurrent.TimeUnit.DAYS).cachePublic())
                .contentType(mediaType)
                .header("X-Content-Type-Options", "nosniff");

        // 非图片/视频文件强制下载，防止浏览器执行脚本
        if (!PUBLIC_EXTENSIONS.contains(ext)) {
            String safeName = relativePath.substring(relativePath.lastIndexOf('/') + 1);
            resp.header("Content-Disposition", "attachment; filename=\"" + safeName + "\"");
        }

        return resp.body(resource);
    }

    /**
     * 批量解析 HTTP 图片 URL → 微信云 cloud:// fileID。
     * 小程序加载物资列表后调用，优先使用 CDN 地址展示图片。
     */
    @GetMapping("/cloud-mappings")
    @Operation(summary = "批量解析图片URL对应的微信云fileID")
    public Result<Map<String, Object>> resolveCloudMappings(
            @RequestHeader(value = "X-Sync-Secret", required = false) String secret,
            @RequestParam("urls") String urlsParam) {

        // sync-secret 校验，与其他 sync 端点一致
        if (syncSecret == null || syncSecret.isBlank() || !syncSecret.equals(secret)) {
            return Result.fail(ErrorCodeConstants.UPLOAD_SYNC_SECRET_INVALID, "Sync Secret 无效");
        }

        Map<String, Object> result = new HashMap<>();
        if (urlsParam == null || urlsParam.isBlank()) {
            result.put("mappings", Map.of());
            return Result.success(result);
        }

        String[] rawUrls = urlsParam.split(",");
        // 收集 non-null non-cloud non-empty URLs，extract storageKey
        Map<String, String> urlToKey = new LinkedHashMap<>(); // 保持顺序
        for (String raw : rawUrls) {
            String u = raw.trim();
            if (u.isEmpty() || u.startsWith("cloud://")) continue;
            String key = extractStorageKeyFromUrl(u);
            if (key != null) {
                urlToKey.put(u, key);
            }
        }

        if (urlToKey.isEmpty()) {
            result.put("mappings", Map.of());
            return Result.success(result);
        }

        List<String> keys = new ArrayList<>(new LinkedHashSet<>(urlToKey.values()));
        List<UploadFileRecord> records = uploadFileRecordService.findByStorageKeyIn(keys);

        // storageKey → wechatFileId
        Map<String, String> keyToCloud = new HashMap<>();
        for (UploadFileRecord r : records) {
            if (r.getWechatFileId() != null && !r.getWechatFileId().isBlank()) {
                keyToCloud.put(r.getStorageKey(), r.getWechatFileId().trim());
            }
        }

        // 构建结果：{ originalUrl → cloudFileId }
        Map<String, String> mappings = new LinkedHashMap<>();
        List<String> unresolvedKeys = new ArrayList<>();
        for (Map.Entry<String, String> e : urlToKey.entrySet()) {
            String cloud = keyToCloud.get(e.getValue());
            if (cloud != null && !cloud.isBlank()) {
                mappings.put(e.getKey(), cloud);
            } else {
                mappings.put(e.getKey(), "");
                unresolvedKeys.add(e.getValue());
            }
        }

        result.put("mappings", mappings);
        if (!unresolvedKeys.isEmpty()) {
            result.put("unresolved", unresolvedKeys.size());
            result.put("pendingSync", uploadFileRecordService.countPendingSync());
        }
        return Result.success(result);
    }

    /**
     * 从图片 URL 中提取 storage_key（/files/ 后面的路径部分）。
     * 支持: http://host/api/upload/files/20260612/uuid.jpg → 20260612/uuid.jpg
     *       /api/upload/files/20260612/uuid.jpg → 20260612/uuid.jpg
     */
    private String extractStorageKeyFromUrl(String url) {
        if (url == null || url.isBlank()) return null;
        String u = url.trim();
        if (u.contains("/api/public/login-branding/files/")) {
            return null;
        }
        int idx = u.indexOf("/files/");
        if (idx < 0) return null;
        String after = u.substring(idx + 7); // skip "/files/"
        int qm = after.indexOf('?');
        if (qm >= 0) after = after.substring(0, qm);
        after = after.trim();
        return after.isEmpty() ? null : after;
    }

    /** 从 url 参数或绝对地址中提取 login-branding 文件名（32hex.ext） */
    private String extractLoginBrandingFileName(String url) {
        if (url == null || url.isBlank()) return null;
        String u = url.trim();
        int qm = u.indexOf('?');
        if (qm >= 0) u = u.substring(0, qm);
        int hash = u.indexOf('#');
        if (hash >= 0) u = u.substring(0, hash);
        final String marker = "/api/public/login-branding/files/";
        int idx = u.indexOf(marker);
        if (idx < 0) return null;
        String name = u.substring(idx + marker.length()).trim();
        if (name.isEmpty() || name.contains("..") || name.contains("/")) return null;
        return name;
    }

    private String extractExtension(String filename) {
        if (!StringUtils.hasText(filename)) {
            return "";
        }
        int idx = filename.lastIndexOf('.');
        if (idx < 0 || idx == filename.length() - 1) {
            return "";
        }
        String ext = filename.substring(idx + 1).toLowerCase();
        return ext.replaceAll("[^a-z0-9]", "");
    }

    private MediaType resolveMediaType(Path filePath) {
        try {
            String contentType = Files.probeContentType(filePath);
            if (StringUtils.hasText(contentType)) {
                return MediaType.parseMediaType(contentType);
            }
        } catch (Exception ignored) {
            log.debug("探测文件ContentType失败: {}", ignored.getMessage());
        }
        return MediaType.APPLICATION_OCTET_STREAM;
    }

    @PostMapping("/sync/register")
    @Operation(summary = "云函数注册文件（从小程序同步到后端）")
    public Result<?> syncRegister(
            @RequestHeader(value = "X-Sync-Secret", required = false) String secret,
            @RequestParam(value = "file", required = false) MultipartFile file,
            @RequestParam("wechatFileId") String wechatFileId,
            @RequestParam(value = "originalName", required = false) String originalName,
            @RequestParam(value = "mimeType", required = false) String mimeType) throws Exception {

        if (syncSecret == null || syncSecret.isBlank() || !syncSecret.equals(secret)) {
            return Result.fail(ErrorCodeConstants.UPLOAD_SYNC_SECRET_INVALID, "Sync Secret 无效");
        }
        if (wechatFileId == null || wechatFileId.isBlank()) {
            return Result.error("wechatFileId 不能为空");
        }

        String dateDir = LocalDate.now().toString().replace("-", "");
        String fileName;

        if (file != null && !file.isEmpty()) {
            // 带文件：存盘
            String ext = extractExtension(file.getOriginalFilename());
            // sync/register 也需通过扩展名白名单校验
            if (ext.isEmpty() || !UploadFileStorageService.ALLOWED_EXTENSIONS.contains(ext)) {
                return Result.error("不支持的文件类型: " + (ext.isEmpty() ? "未知" : "." + ext));
            }
            fileName = UUID.randomUUID().toString().replace("-", "") + (ext.isEmpty() ? "" : "." + ext);
            Path baseDir = uploadFileService.resolveBaseDir();
            Path targetDir = baseDir.resolve(dateDir);
            Files.createDirectories(targetDir);
            Path target = targetDir.resolve(fileName);
            try (InputStream inputStream = file.getInputStream()) {
                Files.copy(inputStream, target, StandardCopyOption.REPLACE_EXISTING);
            }
            if (mimeType == null || mimeType.isBlank()) {
                mimeType = file.getContentType();
            }
        } else {
            // 不带文件：仅注册 wechat_file_id 关联（图片已在微信云，后端不重复存盘）
            fileName = "wechat-only-" + UUID.randomUUID().toString().replace("-", "");
        }

        UploadFileRecord record = new UploadFileRecord();
        record.setStorageKey(dateDir + "/" + fileName);
        record.setPublicUrl(buildPublicUrl(dateDir, fileName));
        record.setWechatFileId(wechatFileId);
        record.setOriginalName(originalName != null ? originalName : "mini-program-upload");
        record.setMimeType(mimeType);
        record.setSizeBytes(file != null && !file.isEmpty() ? file.getSize() : 0L);
        record.setSource("MINIPROGRAM");
        record.setSyncedToWechat(true);
        uploadFileRecordService.create(record);

        Map<String, Object> data = new HashMap<>();
        data.put("publicUrl", record.getPublicUrl());
        data.put("recordId", record.getId());
        data.put("wechatFileId", wechatFileId);
        return Result.success(data);
    }

    @GetMapping("/records/{id}")
    @Operation(summary = "查询单条文件记录（前端用 JWT，云函数用 X-Sync-Secret）")
    public Result<?> getRecord(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestHeader(value = "X-Sync-Secret", required = false) String secret,
            @PathVariable("id") Long id) {
        // 双认证：JWT 或 sync-secret，满足其一即可
        boolean syncOk = syncSecret != null && !syncSecret.isBlank() && syncSecret.equals(secret);
        if (!syncOk) {
            User user = authContextService.resolveUserFromBearer(authorization);
            if (user == null) {
                return Result.fail(ErrorCodeConstants.UPLOAD_SYNC_SECRET_INVALID, "未登录或密钥无效");
            }
        }
        UploadFileRecord record = uploadFileRecordService.findById(id);
        if (record == null) {
            return Result.fail(ErrorCodeConstants.UPLOAD_FILE_NOT_FOUND, "文件记录不存在");
        }
        return Result.success(record);
    }

    @GetMapping("/records/pending-sync")
    @Operation(summary = "查询待同步到微信云的文件列表（云函数轮询用）")
    public Result<?> pendingSync(
            @RequestHeader(value = "X-Sync-Secret", required = false) String secret,
            @RequestParam(value = "limit", defaultValue = "20") int limit) {

        if (syncSecret == null || syncSecret.isBlank() || !syncSecret.equals(secret)) {
            return Result.fail(ErrorCodeConstants.UPLOAD_SYNC_SECRET_INVALID, "Sync Secret 无效");
        }
        List<UploadFileRecord> records = uploadFileRecordService.findPendingSync(Math.min(limit, 100));
        return Result.success(records);
    }

    @PutMapping("/records/{id}/wechat-file-id")
    @Operation(summary = "云函数回填微信云 fileID")
    public Result<?> updateWechatFileId(
            @RequestHeader(value = "X-Sync-Secret", required = false) String secret,
            @PathVariable("id") Long id,
            @RequestParam("wechatFileId") String wechatFileId) {

        if (syncSecret == null || syncSecret.isBlank() || !syncSecret.equals(secret)) {
            return Result.fail(ErrorCodeConstants.UPLOAD_SYNC_SECRET_INVALID, "Sync Secret 无效");
        }
        UploadFileRecord record = uploadFileRecordService.findById(id);
        if (record == null) {
            return Result.fail(ErrorCodeConstants.UPLOAD_FILE_NOT_FOUND, "文件记录不存在");
        }
        uploadFileRecordService.markSynced(id, wechatFileId);

        Map<String, Object> data = new HashMap<>();
        data.put("id", id);
        data.put("wechatFileId", wechatFileId);
        data.put("synced", true);
        return Result.success(data);
    }

    /**
     * 存量迁移：扫描数据库中所有 cloud:// 开头的图片 URL。
     * 云函数调用此接口获取待迁移列表。
     */
    @GetMapping("/sync/cloud-urls")
    @Operation(summary = "扫描数据库中所有 cloud:// 图片 URL（存量迁移用）")
    public Result<?> scanCloudUrls(
            @RequestHeader(value = "X-Sync-Secret", required = false) String secret) {

        if (syncSecret == null || syncSecret.isBlank() || !syncSecret.equals(secret)) {
            return Result.fail(ErrorCodeConstants.UPLOAD_SYNC_SECRET_INVALID, "Sync Secret 无效");
        }

        // 【新增图片列在此加一行】详见 docs/双端图片互通开发者指南.md
        List<ScanTarget> targets = List.of(
                new ScanTarget("supply_item", "cover_url", "id", false),
                new ScanTarget("repair_order", "request_images_json", "id", true),
                new ScanTarget("repair_order", "result_images_json", "id", true),
                new ScanTarget("purchase_order", "request_images_json", "id", true),
                new ScanTarget("purchase_order", "result_images_json", "id", true),
                new ScanTarget("twin_student_violation", "image_urls", "id", true),
                new ScanTarget("asset_transfer_request", "photo_url", "id", false),
                new ScanTarget("asset_transfer_request", "photo_urls_before", "id", true),
                new ScanTarget("asset_transfer_request", "photo_urls_after", "id", true)
        );

        Set<String> cloudUrls = new LinkedHashSet<>();
        List<Map<String, Object>> details = new ArrayList<>();
        ObjectMapper objectMapper = new ObjectMapper();

        for (ScanTarget target : targets) {
            try {
                List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                        "SELECT " + target.pkCol + ", " + target.col
                        + " FROM " + target.table
                        + " WHERE " + target.col + " IS NOT NULL"
                        + " AND " + target.col + " != ''"
                );
                for (Map<String, Object> row : rows) {
                    Object val = row.get(target.col);
                    if (val == null) continue;
                    String text = val.toString();
                    if (!text.contains("cloud://")) continue;

                    if (target.isJsonArray) {
                        try {
                            @SuppressWarnings("unchecked")
                            List<String> list = objectMapper.readValue(text, List.class);
                            if (list != null) {
                                for (String url : list) {
                                    if (url != null && url.startsWith("cloud://")) {
                                        cloudUrls.add(url);
                                        details.add(Map.of(
                                                "table", target.table,
                                                "column", target.col,
                                                "rowId", String.valueOf(row.get(target.pkCol)),
                                                "url", url
                                        ));
                                    }
                                }
                            }
                        } catch (Exception ignored) {
                            log.debug("JSON解析失败: {}.{} row={}", target.table, target.col, row.get(target.pkCol));
                        }
                    } else {
                        if (text.startsWith("cloud://")) {
                            cloudUrls.add(text);
                            details.add(Map.of(
                                    "table", target.table,
                                    "column", target.col,
                                    "rowId", String.valueOf(row.get(target.pkCol)),
                                    "url", text
                            ));
                        }
                    }
                }
            } catch (Exception e) {
                log.warn("扫描 {}.{} 失败: {}", target.table, target.col, e.getMessage());
            }
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("total", cloudUrls.size());
        result.put("cloudUrls", new ArrayList<>(cloudUrls));
        result.put("details", details);
        return Result.success(result);
    }

    /**
     * 存量迁移：批量替换数据库中的 cloud:// URL 为公网 URL。
     * 请求体：{ "replacements": { "cloud://xxx": "http://...", ... } }
     */
    @PostMapping("/sync/replace-urls")
    @Operation(summary = "批量替换数据库中的 cloud:// URL（存量迁移用）")
    public Result<?> replaceUrls(
            @RequestHeader(value = "X-Sync-Secret", required = false) String secret,
            @RequestBody Map<String, Object> body) {

        if (syncSecret == null || syncSecret.isBlank() || !syncSecret.equals(secret)) {
            return Result.fail(ErrorCodeConstants.UPLOAD_SYNC_SECRET_INVALID, "Sync Secret 无效");
        }

        @SuppressWarnings("unchecked")
        Map<String, String> replacements = (Map<String, String>) body.getOrDefault("replacements", Map.of());
        if (replacements.isEmpty()) {
            return Result.success(Map.of("replaced", 0));
        }

        // 要替换的表和 JSON 数组列
        // 【新增图片列在此加一行】详见 docs/双端图片互通开发者指南.md
        List<ScanTarget> targets = List.of(
                new ScanTarget("supply_item", "cover_url", "id", false),
                new ScanTarget("repair_order", "request_images_json", "id", true),
                new ScanTarget("repair_order", "result_images_json", "id", true),
                new ScanTarget("purchase_order", "request_images_json", "id", true),
                new ScanTarget("purchase_order", "result_images_json", "id", true),
                new ScanTarget("twin_student_violation", "image_urls", "id", true),
                new ScanTarget("asset_transfer_request", "photo_url", "id", false),
                new ScanTarget("asset_transfer_request", "photo_urls_before", "id", true),
                new ScanTarget("asset_transfer_request", "photo_urls_after", "id", true)
        );

        int totalReplaced = 0;
        List<Map<String, Object>> details = new ArrayList<>();
        ObjectMapper objectMapper = new ObjectMapper();

        for (ScanTarget target : targets) {
            for (Map.Entry<String, String> entry : replacements.entrySet()) {
                String oldUrl = entry.getKey();
                String newUrl = entry.getValue();
                try {
                    if (target.isJsonArray) {
                        // JSON 数组列：用 REPLACE 整列替换
                        int updated = jdbcTemplate.update(
                                "UPDATE " + target.table
                                + " SET " + target.col + " = REPLACE(" + target.col + ", ?, ?)"
                                + " WHERE " + target.col + " LIKE ?",
                                oldUrl, newUrl, "%" + oldUrl + "%"
                        );
                        if (updated > 0) {
                            totalReplaced += updated;
                            details.add(Map.of("table", target.table, "col", target.col,
                                    "oldUrl", oldUrl, "newUrl", newUrl, "rows", updated));
                        }
                    } else {
                        // 普通字符串列：直接匹配替换
                        int updated = jdbcTemplate.update(
                                "UPDATE " + target.table
                                + " SET " + target.col + " = ?"
                                + " WHERE " + target.col + " = ?",
                                newUrl, oldUrl
                        );
                        if (updated > 0) {
                            totalReplaced += updated;
                            details.add(Map.of("table", target.table, "col", target.col,
                                    "oldUrl", oldUrl, "newUrl", newUrl, "rows", updated));
                        }
                    }
                } catch (Exception e) {
                    log.warn("替换 {}.{} 中 {} → {} 失败: {}",
                            target.table, target.col, oldUrl, newUrl, e.getMessage());
                }
            }
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("replaced", totalReplaced);
        result.put("details", details);
        return Result.success(result);
    }

    /**
     * 一键替换：根据 upload_file_record 表中已有的记录，自动替换数据库中所有
     * cloud:// URL 为对应的 publicUrl。用于存量迁移的批量更新步骤。
     */
    @PostMapping("/sync/auto-replace")
    @Operation(summary = "根据已有 upload_file_record 自动替换数据库中的 cloud:// URL")
    public Result<?> autoReplace(
            @RequestHeader(value = "X-Sync-Secret", required = false) String secret,
            @RequestParam(value = "dryRun", defaultValue = "false") boolean dryRun) {

        if (syncSecret == null || syncSecret.isBlank() || !syncSecret.equals(secret)) {
            return Result.fail(ErrorCodeConstants.UPLOAD_SYNC_SECRET_INVALID, "Sync Secret 无效");
        }

        // 从 upload_file_record 表读取所有已同步的记录
        List<UploadFileRecord> allRecords = jdbcTemplate.query(
                "SELECT id, wechat_file_id, public_url FROM upload_file_record"
                + " WHERE wechat_file_id IS NOT NULL AND wechat_file_id != ''"
                + " AND public_url IS NOT NULL AND public_url != ''",
                (rs, rowNum) -> {
                    UploadFileRecord r = new UploadFileRecord();
                    r.setId(rs.getLong("id"));
                    r.setWechatFileId(rs.getString("wechat_file_id"));
                    r.setPublicUrl(rs.getString("public_url"));
                    return r;
                }
        );

        // 构建替换映射
        Map<String, String> replacements = new LinkedHashMap<>();
        for (UploadFileRecord r : allRecords) {
            if (r.getWechatFileId() != null && r.getPublicUrl() != null) {
                replacements.put(r.getWechatFileId(), r.getPublicUrl());
            }
        }

        if (dryRun) {
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("dryRun", true);
            result.put("pairsFound", replacements.size());
            return Result.success(result);
        }

        // 复用 replaceUrls 逻辑
        // 【新增图片列在此加一行】详见 docs/双端图片互通开发者指南.md
        List<ScanTarget> targets = List.of(
                new ScanTarget("supply_item", "cover_url", "id", false),
                new ScanTarget("repair_order", "request_images_json", "id", true),
                new ScanTarget("repair_order", "result_images_json", "id", true),
                new ScanTarget("purchase_order", "request_images_json", "id", true),
                new ScanTarget("purchase_order", "result_images_json", "id", true),
                new ScanTarget("twin_student_violation", "image_urls", "id", true),
                new ScanTarget("asset_transfer_request", "photo_url", "id", false),
                new ScanTarget("asset_transfer_request", "photo_urls_before", "id", true),
                new ScanTarget("asset_transfer_request", "photo_urls_after", "id", true)
        );

        int totalReplaced = 0;
        List<Map<String, Object>> details = new ArrayList<>();

        for (ScanTarget target : targets) {
            for (Map.Entry<String, String> entry : replacements.entrySet()) {
                String oldUrl = entry.getKey();
                String newUrl = entry.getValue();
                try {
                    if (target.isJsonArray) {
                        int updated = jdbcTemplate.update(
                                "UPDATE " + target.table
                                + " SET " + target.col + " = REPLACE(" + target.col + ", ?, ?)"
                                + " WHERE " + target.col + " LIKE ?",
                                oldUrl, newUrl, "%" + oldUrl + "%"
                        );
                        if (updated > 0) {
                            totalReplaced += updated;
                            details.add(Map.of("table", target.table, "col", target.col, "rows", updated));
                        }
                    } else {
                        int updated = jdbcTemplate.update(
                                "UPDATE " + target.table
                                + " SET " + target.col + " = ?"
                                + " WHERE " + target.col + " = ?",
                                newUrl, oldUrl
                        );
                        if (updated > 0) {
                            totalReplaced += updated;
                            details.add(Map.of("table", target.table, "col", target.col, "rows", updated));
                        }
                    }
                } catch (Exception e) {
                    log.warn("auto-replace 失败 {}.{}: {}", target.table, target.col, e.getMessage());
                }
            }
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("pairs", replacements.size());
        result.put("replaced", totalReplaced);
        result.put("details", details);
        return Result.success(result);
    }

    /**
     * 批量修复：把数据库所有相对路径 /api/upload/files/... 替换为完整公网 URL。
     * 解决小程序端把相对路径当本地文件加载导致 500 的问题。
     */
    @PostMapping("/sync/fix-relative-urls")
    @Operation(summary = "把数据库中的相对路径替换为完整公网 URL")
    public Result<?> fixRelativeUrls(
            @RequestHeader(value = "X-Sync-Secret", required = false) String secret) {

        if (syncSecret == null || syncSecret.isBlank() || !syncSecret.equals(secret)) {
            return Result.fail(ErrorCodeConstants.UPLOAD_SYNC_SECRET_INVALID, "Sync Secret 无效");
        }
        if (publicBaseUrl == null || publicBaseUrl.isBlank()) {
            return Result.error("app.public-base-url 未配置，无法修复");
        }

        String prefix = publicBaseUrl.replaceAll("/+$", "");
        String oldPrefix = "/api/upload/files/";

        // 【新增图片列在此加一行】详见 docs/双端图片互通开发者指南.md
        List<ScanTarget> targets = List.of(
                new ScanTarget("supply_item", "cover_url", "id", false),
                new ScanTarget("repair_order", "request_images_json", "id", true),
                new ScanTarget("repair_order", "result_images_json", "id", true),
                new ScanTarget("purchase_order", "request_images_json", "id", true),
                new ScanTarget("purchase_order", "result_images_json", "id", true),
                new ScanTarget("twin_student_violation", "image_urls", "id", true),
                new ScanTarget("asset_transfer_request", "photo_url", "id", false),
                new ScanTarget("asset_transfer_request", "photo_urls_before", "id", true),
                new ScanTarget("asset_transfer_request", "photo_urls_after", "id", true)
        );

        int totalFixed = 0;
        for (ScanTarget t : targets) {
            try {
                if (t.isJsonArray) {
                    int n = jdbcTemplate.update(
                            "UPDATE " + t.table + " SET " + t.col
                            + " = REPLACE(" + t.col + ", ?, ?)"
                            + " WHERE " + t.col + " LIKE ?",
                            oldPrefix, prefix + oldPrefix, "%" + oldPrefix + "%"
                    );
                    totalFixed += n;
                } else {
                    int n = jdbcTemplate.update(
                            "UPDATE " + t.table + " SET " + t.col
                            + " = CONCAT(?, " + t.col + ")"
                            + " WHERE " + t.col + " LIKE '/api/upload/files/%'"
                            + " AND " + t.col + " NOT LIKE 'http%'",
                            prefix
                    );
                    totalFixed += n;
                }
            } catch (Exception e) {
                log.warn("fix-relative-urls 跳过 {}.{}: {}", t.table, t.col, e.getMessage());
            }
        }

        return Result.success(Map.of("fixed", totalFixed));
    }

    // ---- helpers ----

    private static class ScanTarget {
        final String table, col, pkCol;
        final boolean isJsonArray;

        ScanTarget(String table, String col, String pkCol, boolean isJsonArray) {
            this.table = table;
            this.col = col;
            this.pkCol = pkCol;
            this.isJsonArray = isJsonArray;
        }
    }

    private String buildPublicUrl(String dateDir, String fileName) {
        String path = "/api/upload/files/" + dateDir + "/" + fileName;
        if (publicBaseUrl != null && !publicBaseUrl.isBlank()) {
            return publicBaseUrl.replaceAll("/+$", "") + path;
        }
        return path;
    }

    /**
     * 修复同步链路：清理无效待同步记录 + 回填 supply_item 缺失的 upload_file_record。
     * 云函数 sync-secret 认证。
     */
    @PostMapping("/repair/sync-records")
    @Operation(summary = "修复同步链路：清理死记录 + 回填缺失的 file_record")
    public Result<Map<String, Object>> repairSyncRecords(
            @RequestHeader(value = "X-Sync-Secret", required = false) String secret) {

        if (syncSecret == null || syncSecret.isBlank() || !syncSecret.equals(secret)) {
            return Result.fail(ErrorCodeConstants.UPLOAD_SYNC_SECRET_INVALID, "Sync Secret 无效");
        }

        Map<String, Object> report = new LinkedHashMap<>();
        Path baseDir = uploadFileService.resolveBaseDir();
        int cleanedDead = 0;
        int backfilled = 0;

        // === 1. 清理无效待同步记录（源文件已不存在） ===
        List<UploadFileRecord> pending = uploadFileRecordService.findPendingSync(1000);
        for (UploadFileRecord r : pending) {
            try {
                Path filePath = baseDir.resolve(r.getStorageKey()).normalize();
                if (!Files.exists(filePath)) {
                    uploadFileRecordService.deleteById(r.getId());
                    cleanedDead++;
                    log.info("[repair] 清理无效记录 id={} storageKey={}", r.getId(), r.getStorageKey());
                }
            } catch (Exception e) {
                log.warn("[repair] 检查记录失败 id={}: {}", r.getId(), e.getMessage());
            }
        }

        // === 2. 扫描 supply_item.cover_url，回填缺失的 upload_file_record ===
        List<Map<String, Object>> orphanUrls = jdbcTemplate.queryForList(
            "SELECT id, cover_url FROM supply_item WHERE cover_url IS NOT NULL AND cover_url != '' AND cover_url NOT LIKE 'cloud://%'"
        );
        for (Map<String, Object> row : orphanUrls) {
            try {
                String url = String.valueOf(row.get("cover_url")).trim();
                if (url.isEmpty()) continue;
                String storageKey = extractStorageKeyFromUrl(url);
                if (storageKey == null) continue;

                // 检查是否已有 record
                UploadFileRecord exist = uploadFileRecordService.findByStorageKey(storageKey);
                if (exist != null) continue;

                // 检查文件是否存在
                Path filePath = baseDir.resolve(storageKey).normalize();
                if (!Files.exists(filePath)) continue;

                // 文件存在但缺 record → 创建
                String dateDir = storageKey.contains("/") ? storageKey.substring(0, storageKey.indexOf('/')) : "unknown";
                String fileName = storageKey.contains("/") ? storageKey.substring(storageKey.indexOf('/') + 1) : storageKey;
                long size = Files.size(filePath);
                String mime = Files.probeContentType(filePath);
                if (mime == null || mime.isBlank()) mime = "image/jpeg";

                UploadFileRecord rec = new UploadFileRecord();
                rec.setStorageKey(storageKey);
                rec.setPublicUrl(buildPublicUrl(dateDir, fileName));
                rec.setOriginalName(fileName);
                rec.setMimeType(mime);
                rec.setSizeBytes(size);
                rec.setSource("WEB");
                rec.setSyncedToWechat(false);
                uploadFileRecordService.create(rec);
                backfilled++;
                log.info("[repair] 回填 record storageKey={} url={}", storageKey, rec.getPublicUrl());
            } catch (Exception e) {
                log.warn("[repair] 回填失败 supply_item.id={}: {}", row.get("id"), e.getMessage());
            }
        }

        // === 3. 扫描 asset_transfer_request，回填缺失的 upload_file_record ===
        int assetFixed = 0;
        int assetScanned = 0;
        ObjectMapper om = new ObjectMapper();
        String[] assetCols = {"photo_url", "photo_urls_before", "photo_urls_after"};
        for (String col : assetCols) {
            boolean isJson = col.startsWith("photo_urls_");
            List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                "SELECT id, " + col + " FROM asset_transfer_request WHERE " + col + " IS NOT NULL AND " + col + " != '' AND " + col + " NOT LIKE 'cloud://%'"
            );
            for (Map<String, Object> row : rows) {
                assetScanned++;
                try {
                    String raw = String.valueOf(row.get(col)).trim();
                    List<String> urls = new ArrayList<>();
                    if (isJson) {
                        try {
                            @SuppressWarnings("unchecked")
                            List<String> parsed = om.readValue(raw, List.class);
                            if (parsed != null) urls = parsed;
                        } catch (Exception ignore) { urls = List.of(raw); }
                    } else {
                        urls = List.of(raw);
                    }
                    for (String url : urls) {
                        if (url == null || url.isBlank() || url.startsWith("cloud://")) continue;
                        String storageKey = extractStorageKeyFromUrl(url);
                        if (storageKey == null) continue;
                        UploadFileRecord exist = uploadFileRecordService.findByStorageKey(storageKey);
                        if (exist != null) continue;
                        Path filePath = baseDir.resolve(storageKey).normalize();
                        if (!Files.exists(filePath)) continue;
                        String dateDir = storageKey.contains("/") ? storageKey.substring(0, storageKey.indexOf('/')) : "unknown";
                        String fileName = storageKey.contains("/") ? storageKey.substring(storageKey.indexOf('/') + 1) : storageKey;
                        long size = Files.size(filePath);
                        String mime = Files.probeContentType(filePath);
                        if (mime == null || mime.isBlank()) mime = "image/jpeg";
                        UploadFileRecord rec = new UploadFileRecord();
                        rec.setStorageKey(storageKey);
                        rec.setPublicUrl(buildPublicUrl(dateDir, fileName));
                        rec.setOriginalName(fileName);
                        rec.setMimeType(mime);
                        rec.setSizeBytes(size);
                        rec.setSource("WEB");
                        rec.setSyncedToWechat(false);
                        uploadFileRecordService.create(rec);
                        assetFixed++;
                        backfilled++;
                    }
                } catch (Exception e) {
                    log.warn("[repair] asset回填失败 col={} id={}: {}", col, row.get("id"), e.getMessage());
                }
            }
        }

        report.put("cleanedDeadRecords", cleanedDead);
        report.put("backfilledRecords", backfilled);
        report.put("scannedSupplyItems", orphanUrls.size());
        report.put("assetFixedRecords", assetFixed);
        report.put("assetScannedRows", assetScanned);
        report.put("remainingPendingSync", uploadFileRecordService.countPendingSync());
        return Result.success(report);
    }
}
