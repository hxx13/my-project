package com.example.demo.modules.upload.service;

import com.example.demo.modules.upload.entity.UploadFileRecord;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.LocalDate;
import java.util.UUID;

/**
 * 统一落盘 + upload_file_record 写入，供 /api/upload 与登录轮播等模块共用。
 */
@Service
public class UploadFileStorageService {

    public record StoredUploadFile(String url, String publicUrl, Long recordId) {
    }

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
        String ext = extractExtension(file.getOriginalFilename());
        String dateDir = LocalDate.now().toString().replace("-", "");
        Path baseDir = uploadFileService.resolveBaseDir();
        Path targetDir = baseDir.resolve(dateDir);
        Files.createDirectories(targetDir);
        String fileName = UUID.randomUUID().toString().replace("-", "")
                + (ext.isEmpty() ? "" : "." + ext);
        Path target = targetDir.resolve(fileName);
        try (InputStream inputStream = file.getInputStream()) {
            Files.copy(inputStream, target, StandardCopyOption.REPLACE_EXISTING);
        }

        UploadFileRecord record = new UploadFileRecord();
        record.setStorageKey(dateDir + "/" + fileName);
        record.setPublicUrl(buildPublicUrl(dateDir, fileName));
        record.setOriginalName(file.getOriginalFilename());
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
}
