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

    /**
     * 收 PDF、图片，以及**能被 LibreOffice 转成 PDF 的** Office 文档。
     *
     * 浏览器渲染不了 Word/Excel，工位页必须拿到 PDF 或图片才能静默打印，
     * 所以 Office 文档在上传时就转换掉、PDF 存一份在旁边（见 {@code pdf_storage_key}），
     * 打印链路永远只吃 PDF。
     *
     * 不收的类型（zip / txt 等）**故意不转换** —— 它们转不出有意义的版面。
     */
    private static final Set<String> ALLOWED_EXT = new HashSet<>(Arrays.asList(
            "pdf", "png", "jpg", "jpeg",
            "doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "ods", "odp", "rtf"
    ));

    private final AdminFileTemplateJdbcRepository repo;
    private final AdminFileTemplateLocalStorage storage;
    private final OfficeToPdfConverter officeConverter;
    private final long maxBytes;

    public AdminFileTemplateService(
            AdminFileTemplateJdbcRepository repo,
            AdminFileTemplateLocalStorage storage,
            OfficeToPdfConverter officeConverter,
            @Value("${app.admin.template-max-bytes:26214400}") long maxBytes
    ) {
        this.repo = repo;
        this.storage = storage;
        this.officeConverter = officeConverter;
        this.maxBytes = Math.max(1024, maxBytes);
    }

    /**
     * 按用途列列表：缺表时返回空列表 + schemaHint，避免管理端 GET 直接 500（不能替代执行 DDL）。
     * purpose 传 null 表示不过滤。
     */
    public AdminFileTemplateListResult listMetadataForAdmin(String purpose, Long folderId) {
        try {
            return new AdminFileTemplateListResult(repo.listByPurpose(purpose, folderId), null);
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

    /**
     * 上传落盘。
     *
     * @param purpose   用途标记（TEMPLATE / SOP），决定它出现在哪个消费者的列表里。
     *                  这张表是全站共用的 blob 表，不打标就会串到「文件模板库」去。
     * @param ephemeral 一次性文件：打完即删，且不出现在文件模板库列表里。
     *                  用于「临时打印」——上传即打，不留记录。
     */
    public Map<String, Object> saveUpload(MultipartFile file, String uploadedByUserId,
                                          String purpose, boolean ephemeral, Long folderId)
            throws IOException {
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
            throw new IllegalArgumentException(
                    "不允许的文件类型。只收 PDF 和图片（png / jpg）；Word、Excel 请先另存为 PDF 再上传。");
        }
        String id = "AFT_" + UUID.randomUUID().toString().replace("-", "");
        String innerName = UUID.randomUUID().toString().replace("-", "") + "." + ext;
        String storageKey = id + "/" + innerName;
        byte[] bytes = file.getBytes();
        storage.put(storageKey, bytes);

        // Office 文档在上传时就转一份 PDF 存在旁边：打印链路永远只吃 PDF，一行都不用改。
        // 转换失败**直接拒掉这次上传** —— 不静默降级成「文件存下来了但打不了」，
        // 那种情况用户要等到真去打印时才发现，而且会以为是打印机的锅。
        String pdfStorageKey = null;
        if (OfficeToPdfConverter.isOfficeExt(ext)) {
            byte[] pdf;
            try {
                pdf = officeConverter.convert(bytes, ext);
            } catch (IOException e) {
                storage.deleteIfExists(storageKey);
                log.warn("[admin-file-template] 文档转换失败 name={}: {}", original, e.getMessage());
                throw new IllegalArgumentException("文档转换失败：" + e.getMessage()
                        + "。服务端需要安装 LibreOffice 与中文字体。");
            }
            pdfStorageKey = id + "/" + UUID.randomUUID().toString().replace("-", "") + ".pdf";
            storage.put(pdfStorageKey, pdf);
        }

        String mime = StringUtils.hasText(file.getContentType()) ? file.getContentType() : "application/octet-stream";
        String tag = normalizePurpose(purpose);
        try {
            repo.insert(id, original, storageKey, mime, bytes.length, uploadedByUserId, tag, ephemeral, pdfStorageKey, folderId);
        } catch (BadSqlGrammarException ex) {
            storage.deleteIfExists(storageKey);
            storage.deleteIfExists(pdfStorageKey);
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
        row.put("purpose", tag);
        row.put("ephemeral", ephemeral);
        row.put("converted", pdfStorageKey != null);
        row.put("createTime", now);
        return row;
    }

    /** 这个文件是不是一次性的（打完即删）。 */
    public boolean isEphemeral(String id) {
        try {
            return repo.isEphemeral(id);
        } catch (BadSqlGrammarException ex) {
            return false;
        }
    }

    /**
     * 打过就删：只删一次性文件，普通模板不受影响。
     * 找不到 / 不是一次性的都返回 false，调用方据此决定要不要记日志。
     */
    public boolean deleteIfEphemeral(String id) {
        try {
            if (!repo.isEphemeral(id)) return false;
            delete(id);
            return true;
        } catch (Exception e) {
            log.warn("[admin-file-template] 清理一次性文件失败 id={}: {}", id, e.getMessage());
            return false;
        }
    }

    /**
     * 清理过期的一次性文件，返回清理条数。
     *
     * 这是「打完即删」的兜底：任务失败、或工位压根没来取，那条快路就不会走，
     * 文件会一直躺着 —— 那就留痕了。所以必须有一条按时间的兜底。
     * 查询排除了还停在 PENDING/SENT 的任务，免得把工位正要来取的文件删掉。
     */
    public int purgeExpiredEphemeral(int minutes) {
        List<String> ids;
        try {
            ids = repo.findExpiredEphemeralIds(minutes);
        } catch (BadSqlGrammarException ex) {
            log.warn("[admin-file-template] 查询过期一次性文件失败（表或列可能未建）: {}", ex.getMessage());
            return 0;
        }
        int n = 0;
        for (String id : ids) {
            try {
                delete(id);
                n++;
            } catch (Exception e) {
                log.warn("[admin-file-template] 清理过期一次性文件失败 id={}: {}", id, e.getMessage());
            }
        }
        return n;
    }

    /** 认不出用途的一律当文件模板 —— 存量调用方不传 purpose 时行为与改动前一致。 */
    private static String normalizePurpose(String purpose) {
        if (purpose == null || purpose.isBlank()) return "TEMPLATE";
        String p = purpose.trim().toUpperCase();
        return "SOP".equals(p) ? "SOP" : "TEMPLATE";
    }

    public boolean isUploadedBy(String id, String userId) {
        return repo.isUploadedBy(id, userId);
    }

    /** folderId 为 null = 移回未归类 */
    public void moveToFolder(String id, Long folderId) {
        if (repo.findById(id).isEmpty()) {
            throw new IllegalArgumentException("文件不存在");
        }
        repo.updateFolder(id, folderId);
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
        Object pdfKey = row.get().get("pdfStorageKey");
        try {
            repo.deleteById(id);
        } catch (BadSqlGrammarException ex) {
            log.warn("[admin-file-template] 删除记录失败: {}", ex.getMessage());
            throw new IllegalArgumentException(MISSING_TABLE_HINT);
        }
        // 原文件和转换出来的 PDF 都要清掉 —— 只删一个会留下孤儿文件
        storage.deleteIfExists(storageKey);
        if (pdfKey != null && !String.valueOf(pdfKey).isBlank()) {
            storage.deleteIfExists(String.valueOf(pdfKey));
        }
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
