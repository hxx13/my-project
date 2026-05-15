package com.example.demo.modules.adminfile;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.BadSqlGrammarException;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.time.Instant;
import java.util.Arrays;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

@Service
public class AdminFileTemplateService {

    private static final Logger log = LoggerFactory.getLogger(AdminFileTemplateService.class);

    private static final String MISSING_TABLE_HINT =
            "数据库未建 admin_file_template 表，请在目标库执行 scripts/admin_file_templates.ddl.sql"
                    + "（缺站点/推荐码/站内信表时一并执行 scripts/login_branding_invite_chat.ddl.sql）；说明见 scripts/DEPLOY_DDL.md。";

    private static final Set<String> ALLOWED_EXT = new HashSet<>(Arrays.asList(
            "pdf", "xlsx", "xls", "docx", "doc", "zip", "csv", "txt", "png", "jpg", "jpeg"
    ));

    private final AdminFileTemplateJdbcRepository repo;
    private final AdminFileTemplateLocalStorage storage;
    private final long maxBytes;

    public AdminFileTemplateService(
            AdminFileTemplateJdbcRepository repo,
            AdminFileTemplateLocalStorage storage,
            @Value("${app.admin.template-max-bytes:26214400}") long maxBytes
    ) {
        this.repo = repo;
        this.storage = storage;
        this.maxBytes = Math.max(1024, maxBytes);
    }

    /** 列表：缺表时返回空列表 + schemaHint，避免管理端 GET 直接 500（不能替代执行 DDL） */
    public AdminFileTemplateListResult listMetadataForAdmin() {
        try {
            return new AdminFileTemplateListResult(repo.listAll(), null);
        } catch (BadSqlGrammarException ex) {
            log.warn("[admin-file-template] admin_file_template 表不可用: {}", ex.getMessage());
            return new AdminFileTemplateListResult(List.of(), MISSING_TABLE_HINT);
        }
    }

    public Optional<Map<String, Object>> findForDownload(String id) {
        try {
            return repo.findById(id);
        } catch (BadSqlGrammarException ex) {
            log.warn("[admin-file-template] 查询模板失败（表可能未建）: {}", ex.getMessage());
            return Optional.empty();
        }
    }

    public Map<String, Object> saveUpload(MultipartFile file, String uploadedByUserId) throws IOException {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("文件为空");
        }
        if (file.getSize() > maxBytes) {
            throw new IllegalArgumentException("文件超过大小上限（" + maxBytes + " 字节）");
        }
        String original = file.getOriginalFilename();
        if (!StringUtils.hasText(original)) {
            original = "upload.bin";
        }
        original = sanitizeOriginalName(original);
        String ext = extensionOf(original);
        if (ext.isEmpty() || !ALLOWED_EXT.contains(ext)) {
            throw new IllegalArgumentException("不允许的文件类型，仅支持：" + String.join(", ", ALLOWED_EXT));
        }
        String id = "AFT_" + UUID.randomUUID().toString().replace("-", "");
        String innerName = UUID.randomUUID().toString().replace("-", "") + "." + ext;
        String storageKey = id + "/" + innerName;
        byte[] bytes = file.getBytes();
        storage.put(storageKey, bytes);
        String mime = StringUtils.hasText(file.getContentType()) ? file.getContentType() : "application/octet-stream";
        try {
            repo.insert(id, original, storageKey, mime, bytes.length, uploadedByUserId);
        } catch (BadSqlGrammarException ex) {
            storage.deleteIfExists(storageKey);
            log.warn("[admin-file-template] 写入元数据失败: {}", ex.getMessage());
            throw new IllegalArgumentException(MISSING_TABLE_HINT);
        }
        String now = Instant.now().toString();
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("id", id);
        row.put("originalName", original);
        row.put("mimeType", mime);
        row.put("sizeBytes", (long) bytes.length);
        row.put("uploadedByUserId", uploadedByUserId);
        row.put("createTime", now);
        return row;
    }

    public void delete(String id) {
        Optional<Map<String, Object>> row;
        try {
            row = repo.findById(id);
        } catch (BadSqlGrammarException ex) {
            log.warn("[admin-file-template] 删除前查询失败: {}", ex.getMessage());
            throw new IllegalArgumentException(MISSING_TABLE_HINT);
        }
        if (row.isEmpty()) {
            return;
        }
        String storageKey = (String) row.get().get("storageKey");
        try {
            repo.deleteById(id);
        } catch (BadSqlGrammarException ex) {
            log.warn("[admin-file-template] 删除记录失败: {}", ex.getMessage());
            throw new IllegalArgumentException(MISSING_TABLE_HINT);
        }
        storage.deleteIfExists(storageKey);
    }

    public java.io.InputStream openDownloadStream(String storageKey) throws java.io.IOException {
        return storage.openStream(storageKey);
    }

    private static String sanitizeOriginalName(String name) {
        String n = name.replace('\\', '/').trim();
        int slash = n.lastIndexOf('/');
        if (slash >= 0 && slash < n.length() - 1) {
            n = n.substring(slash + 1);
        }
        if (n.length() > 480) {
            n = n.substring(0, 480);
        }
        return n;
    }

    private static String extensionOf(String name) {
        int dot = name.lastIndexOf('.');
        if (dot < 0 || dot == name.length() - 1) {
            return "";
        }
        return name.substring(dot + 1).toLowerCase();
    }
}
