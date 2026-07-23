package com.example.demo.modules.facerecognition.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.nio.file.Files;
import java.nio.file.Path;

/**
 * 模型加载路径：优先 uploads/models/*.zip 本地包，否则远程 URL 下载。
 */
@Component
public class FaceModelPathResolver {

    private static final Logger log = LoggerFactory.getLogger(FaceModelPathResolver.class);

    public static final String REMOTE_FACE_FEATURE =
            "https://resources.djl.ai/test-models/pytorch/face_feature.zip";
    public static final String REMOTE_ULTRANET =
            "https://resources.djl.ai/test-models/pytorch/ultranet.zip";

    @Value("${app.upload.base-dir:uploads}")
    private String uploadBaseDir;

    public String resolveFaceFeatureModel() {
        return resolve("face_feature", REMOTE_FACE_FEATURE);
    }

    public String resolveUltraNetModel() {
        return resolve("ultranet", REMOTE_ULTRANET);
    }

    private String resolve(String artifact, String remoteUrl) {
        try {
            Path zip = Path.of(uploadBaseDir, "models", artifact + ".zip");
            if (Files.isRegularFile(zip)) {
                log.info("[FaceModel] 使用本地模型包: {}", zip.toAbsolutePath());
                return zip.toUri().toString();
            }
            Path dir = Path.of(uploadBaseDir, "models", artifact);
            if (Files.isDirectory(dir)) {
                log.info("[FaceModel] 使用本地模型目录: {}", dir.toAbsolutePath());
                return dir.toUri().toString();
            }
        } catch (Exception e) {
            log.warn("[FaceModel] 本地模型路径检查失败 artifact={}: {}", artifact, e.getMessage());
        }
        return remoteUrl;
    }
}
