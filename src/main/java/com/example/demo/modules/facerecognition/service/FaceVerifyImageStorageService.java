package com.example.demo.modules.facerecognition.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * 门禁人脸验证抓拍帧持久化（供管理端审计展示）。
 */
@Service
public class FaceVerifyImageStorageService {

    private static final Logger log = LoggerFactory.getLogger(FaceVerifyImageStorageService.class);

    @Value("${app.upload.base-dir:uploads}")
    private String uploadBaseDir;

    @Value("${app.public-base-url:http://localhost:8080}")
    private String publicBaseUrl;

    public List<String> saveProbeFrames(String userId, String sessionId, List<byte[]> frames, int nameOffset) {
        List<String> urls = new ArrayList<>();
        if (frames == null || frames.isEmpty()) {
            return urls;
        }
        String safeUser = userId == null ? "unknown" : userId.replaceAll("[^a-zA-Z0-9_-]", "_");
        String safeSession = sessionId == null || sessionId.isBlank()
                ? UUID.randomUUID().toString().substring(0, 8)
                : sessionId.replaceAll("[^a-zA-Z0-9_-]", "_");
        String dateDir = LocalDate.now().toString();
        int offset = Math.max(0, nameOffset);
        try {
            Path targetDir = Path.of(uploadBaseDir, "face-verify", dateDir);
            Files.createDirectories(targetDir);
            int idx = offset;
            for (byte[] frame : frames) {
                if (frame == null || frame.length == 0) continue;
                idx++;
                String storageKey = "face-verify/" + dateDir + "/"
                        + safeUser + "-" + safeSession + "-" + idx + ".jpg";
                Path targetPath = Path.of(uploadBaseDir, storageKey);
                Files.write(targetPath, frame);
                urls.add(publicBaseUrl + "/api/upload/files/" + storageKey);
            }
        } catch (Exception e) {
            log.warn("[FaceVerify] 抓拍图保存失败 userId={}: {}", userId, e.getMessage());
        }
        return urls;
    }
}
