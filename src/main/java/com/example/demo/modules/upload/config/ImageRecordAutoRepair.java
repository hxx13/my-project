package com.example.demo.modules.upload.config;

import com.example.demo.modules.upload.entity.UploadFileRecord;
import com.example.demo.modules.upload.service.UploadFileRecordService;
import com.example.demo.modules.upload.service.UploadFileService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;

/**
 * 应用启动时自动扫描所有已知图片列，为磁盘上存在但缺 upload_file_record 的文件创建记录。
 * 无需手动调用 repair API。
 */
@Component
@Order(200) // 晚于 DDL bootstrap，确保表已存在
public class ImageRecordAutoRepair implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(ImageRecordAutoRepair.class);

    private final JdbcTemplate jdbcTemplate;
    private final UploadFileRecordService uploadFileRecordService;
    private final UploadFileService uploadFileService;
    private final String publicBaseUrl;

    /**
     * 【新增图片列必改】需要扫描的 {表名, 列名, 是否JSON数组}。
     * 详见 docs/双端图片互通开发者指南.md
     */
    private record ScanTarget(String table, String col, boolean isJsonArray) {}

    /** 【新增图片列在此加一行】启动时自动扫描并回填缺失的 upload_file_record */
    private static final List<ScanTarget> SCAN_TARGETS = List.of(
        new ScanTarget("supply_item", "cover_url", false),
        new ScanTarget("asset_transfer_request", "photo_url", false),
        new ScanTarget("asset_transfer_request", "photo_urls_before", true),
        new ScanTarget("asset_transfer_request", "photo_urls_after", true),
        new ScanTarget("repair_order", "request_images_json", true),
        new ScanTarget("repair_order", "result_images_json", true),
        new ScanTarget("purchase_order", "request_images_json", true),
        new ScanTarget("purchase_order", "result_images_json", true),
        new ScanTarget("twin_student_violation", "image_urls", true)
    );

    public ImageRecordAutoRepair(
            JdbcTemplate jdbcTemplate,
            UploadFileRecordService uploadFileRecordService,
            UploadFileService uploadFileService,
            @Value("${app.public-base-url:}") String publicBaseUrl) {
        this.jdbcTemplate = jdbcTemplate;
        this.uploadFileRecordService = uploadFileRecordService;
        this.uploadFileService = uploadFileService;
        this.publicBaseUrl = publicBaseUrl != null ? publicBaseUrl : "";
    }

    @Override
    public void run(ApplicationArguments args) {
        Path baseDir = uploadFileService.resolveBaseDir();
        ObjectMapper om = new ObjectMapper();
        int totalCreated = 0;
        int totalScanned = 0;

        for (ScanTarget target : SCAN_TARGETS) {
            try {
                List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                    "SELECT id, " + target.col + " FROM " + target.table
                    + " WHERE " + target.col + " IS NOT NULL AND " + target.col + " != ''"
                    + " AND " + target.col + " NOT LIKE 'cloud://%'"
                );
                for (Map<String, Object> row : rows) {
                    totalScanned++;
                    try {
                        String raw = String.valueOf(row.get(target.col)).trim();
                        List<String> urls = new ArrayList<>();
                        if (target.isJsonArray) {
                            try {
                                @SuppressWarnings("unchecked")
                                List<String> parsed = om.readValue(raw, List.class);
                                if (parsed != null) urls = parsed;
                            } catch (Exception e) { urls = List.of(raw); }
                        } else {
                            urls = List.of(raw);
                        }
                        for (String url : urls) {
                            if (url == null || url.isBlank() || url.startsWith("cloud://")) continue;
                            String storageKey = extractStorageKey(url);
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
                            totalCreated++;
                        }
                    } catch (Exception e) {
                        log.debug("[auto-repair] 跳过 {}.{} id={}: {}", target.table, target.col, row.get("id"), e.getMessage());
                    }
                }
            } catch (Exception e) {
                log.debug("[auto-repair] 扫描失败 {}: {}", target.table, e.getMessage());
            }
        }

        if (totalCreated > 0) {
            log.info("[auto-repair] 完成：扫描 {} 行，创建 {} 条缺失的 upload_file_record", totalScanned, totalCreated);
        } else {
            log.info("[auto-repair] 完成：扫描 {} 行，未发现缺失记录", totalScanned);
        }
    }

    private String extractStorageKey(String url) {
        if (url == null || url.isBlank()) return null;
        String u = url.trim();
        int idx = u.indexOf("/files/");
        if (idx < 0) return null;
        String after = u.substring(idx + 7);
        int qm = after.indexOf('?');
        if (qm >= 0) after = after.substring(0, qm);
        after = after.trim();
        return after.isEmpty() ? null : after;
    }

    private String buildPublicUrl(String dateDir, String fileName) {
        String path = "/api/upload/files/" + dateDir + "/" + fileName;
        if (publicBaseUrl != null && !publicBaseUrl.isBlank()) {
            return publicBaseUrl.replaceAll("/+$", "") + path;
        }
        return path;
    }
}
