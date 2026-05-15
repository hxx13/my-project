package com.example.demo.modules.upload.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;

@Service
public class UploadFileService {
    private static final String FILE_PREFIX = "/api/upload/files/";

    @Value("${app.upload.base-dir:uploads}")
    private String uploadBaseDir;

    public Path resolveBaseDir() {
        return Paths.get(uploadBaseDir).toAbsolutePath().normalize();
    }

    public void deleteByUrl(String url) {
        if (!StringUtils.hasText(url)) {
            return;
        }
        int idx = url.indexOf(FILE_PREFIX);
        if (idx < 0) {
            return;
        }
        String relativePath = url.substring(idx + FILE_PREFIX.length());
        if (!StringUtils.hasText(relativePath) || relativePath.contains("..")) {
            return;
        }
        Path filePath = resolveBaseDir().resolve(relativePath).normalize();
        if (!filePath.startsWith(resolveBaseDir())) {
            return;
        }
        try {
            Files.deleteIfExists(filePath);
        } catch (Exception ignored) {
        }
    }

    public void deleteByUrls(List<String> urls) {
        if (urls == null || urls.isEmpty()) {
            return;
        }
        urls.forEach(this::deleteByUrl);
    }
}
