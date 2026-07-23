package com.example.demo.modules.facerecognition.service;

import com.alibaba.fastjson2.JSON;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.annotation.PostConstruct;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 底库 embedding 磁盘缓存（重启后复用，减少重复推理）。
 */
@Component
public class FaceEmbeddingDiskCache {

    private static final Logger log = LoggerFactory.getLogger(FaceEmbeddingDiskCache.class);

    @Value("${app.upload.base-dir:uploads}")
    private String uploadBaseDir;

    private Path cacheDir;
    private final Map<String, float[]> memory = new ConcurrentHashMap<>();

    @PostConstruct
    void init() {
        cacheDir = Path.of(uploadBaseDir, "face-embed-cache");
        try {
            Files.createDirectories(cacheDir);
        } catch (Exception e) {
            log.warn("[FaceEmbedCache] 创建目录失败: {}", e.getMessage());
        }
    }

    public float[] get(String imageUrl) {
        if (imageUrl == null || imageUrl.isBlank()) {
            return null;
        }
        String key = imageUrl.trim();
        float[] mem = memory.get(key);
        if (mem != null) {
            return mem;
        }
        Path file = fileFor(key);
        if (!Files.isRegularFile(file)) {
            return null;
        }
        try {
            String json = Files.readString(file, StandardCharsets.UTF_8);
            float[] arr = JSON.parseObject(json, float[].class);
            if (arr != null && arr.length > 0) {
                memory.put(key, arr);
                return arr;
            }
        } catch (Exception e) {
            log.debug("[FaceEmbedCache] 读取失败 key={}: {}", key, e.getMessage());
        }
        return null;
    }

    public void put(String imageUrl, float[] embedding) {
        if (imageUrl == null || imageUrl.isBlank() || embedding == null || embedding.length == 0) {
            return;
        }
        String key = imageUrl.trim();
        memory.put(key, embedding);
        if (cacheDir == null) {
            return;
        }
        try {
            Files.writeString(fileFor(key), JSON.toJSONString(embedding), StandardCharsets.UTF_8);
        } catch (Exception e) {
            log.debug("[FaceEmbedCache] 写入失败 key={}: {}", key, e.getMessage());
        }
    }

    public void invalidate(String imageUrl) {
        if (imageUrl == null) {
            return;
        }
        String key = imageUrl.trim();
        memory.remove(key);
        if (cacheDir == null) {
            return;
        }
        try {
            Files.deleteIfExists(fileFor(key));
        } catch (Exception ignored) {
        }
    }

    private Path fileFor(String imageUrl) {
        return cacheDir.resolve(digest(imageUrl) + ".json");
    }

    private static String digest(String raw) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] hash = md.digest(raw.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (Exception e) {
            return Integer.toHexString(raw.hashCode());
        }
    }
}
