package com.example.demo.modules.upload.service;

import com.example.demo.modules.upload.entity.UploadFileRecord;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import java.io.BufferedInputStream;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.LocalDate;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * 统一落盘 + upload_file_record 写入，供 /api/upload 与登录轮播等模块共用。
 */
@Service
public class UploadFileStorageService {

    public record StoredUploadFile(String url, String publicUrl, Long recordId) {
    }

    /** 允许上传的文件扩展名白名单（public for cross-service validation） */
    public static final Set<String> ALLOWED_EXTENSIONS = Set.of(
            "jpg", "jpeg", "png", "gif", "svg", "webp", "bmp", // 图片
            "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", // 文档
            "txt", "csv", "zip"                                   // 通用
    );

    /** 常见文件类型的 Magic Bytes 签名（前 N 字节的十六进制前缀） */
    private static final Map<String, String> MAGIC_BYTES = Map.ofEntries(
            Map.entry("jpg", "FFD8FF"),
            Map.entry("jpeg", "FFD8FF"),
            Map.entry("png", "89504E47"),
            Map.entry("gif", "47494638"),
            Map.entry("pdf", "25504446"),
            Map.entry("zip", "504B0304"),
            Map.entry("docx", "504B0304"),
            Map.entry("xlsx", "504B0304"),
            Map.entry("pptx", "504B0304")
    );

    private final UploadFileService uploadFileService;
    private final UploadFileRecordService uploadFileRecordService;

    @Value("${app.public-base-url:}")
    private String publicBaseUrl;

    public UploadFileStorageService(UploadFileService uploadFileService,
                                    UploadFileRecordService uploadFileRecordService) {
        this.uploadFileService = uploadFileService;
        this.uploadFileRecordService = uploadFileRecordService;
    }

    public StoredUploadFile store(MultipartFile file, String source) throws Exception {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("文件不能为空");
        }

        String originalName = file.getOriginalFilename();
        String ext = extractExtension(originalName);

        // 1. 扩展名白名单校验
        if (ext.isEmpty() || !ALLOWED_EXTENSIONS.contains(ext)) {
            throw new IllegalArgumentException("不支持的文件类型: " + (ext.isEmpty() ? "未知" : "." + ext));
        }

        // 2. Magic Bytes 校验（仅对已知签名的类型）
        // 使用单次读取 + 回退，避免双 getInputStream() 的兼容性风险
        String expectedMagic = MAGIC_BYTES.get(ext);
        String dateDir = LocalDate.now().toString().replace("-", "");
        Path baseDir = uploadFileService.resolveBaseDir();
        Path targetDir = baseDir.resolve(dateDir);
        Files.createDirectories(targetDir);
        String fileName = UUID.randomUUID().toString().replace("-", "")
                + (ext.isEmpty() ? "" : "." + ext);
        Path target = targetDir.resolve(fileName);

        try (BufferedInputStream bis = new BufferedInputStream(file.getInputStream())) {
            if (expectedMagic != null) {
                bis.mark(expectedMagic.length() / 2 + 1);
                byte[] header = new byte[expectedMagic.length() / 2];
                int read = bis.read(header);
                if (read < header.length) {
                    throw new IllegalArgumentException("文件内容不完整，无法校验");
                }
                String actualMagic = bytesToHex(header).toUpperCase();
                if (!actualMagic.startsWith(expectedMagic)) {
                    throw new IllegalArgumentException("文件内容与扩展名不匹配，拒绝上传");
                }
                bis.reset();
            }
            Files.copy(bis, target, StandardCopyOption.REPLACE_EXISTING);
        }

        UploadFileRecord record = new UploadFileRecord();
        record.setStorageKey(dateDir + "/" + fileName);
        record.setPublicUrl(buildPublicUrl(dateDir, fileName));
        record.setOriginalName(originalName);
        record.setMimeType(file.getContentType());
        record.setSizeBytes(file.getSize());
        record.setSource(StringUtils.hasText(source) ? source.trim() : "WEB");
        record.setSyncedToWechat(false);
        uploadFileRecordService.create(record);

        String url = "/api/upload/files/" + dateDir + "/" + fileName;
        return new StoredUploadFile(url, record.getPublicUrl(), record.getId());
    }

    private String buildPublicUrl(String dateDir, String fileName) {
        String path = "/api/upload/files/" + dateDir + "/" + fileName;
        if (publicBaseUrl != null && !publicBaseUrl.isBlank()) {
            return publicBaseUrl.replaceAll("/+$", "") + path;
        }
        return path;
    }

    private static String extractExtension(String originalFilename) {
        if (!StringUtils.hasText(originalFilename)) {
            return "";
        }
        int dot = originalFilename.lastIndexOf('.');
        if (dot < 0 || dot >= originalFilename.length() - 1) {
            return "";
        }
        return originalFilename.substring(dot + 1).trim().toLowerCase();
    }

    private static String bytesToHex(byte[] bytes) {
        StringBuilder sb = new StringBuilder();
        for (byte b : bytes) {
            sb.append(String.format("%02X", b));
        }
        return sb.toString();
    }
}
