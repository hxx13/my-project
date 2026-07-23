package com.example.demo.modules.facerecognition.service;

import com.example.demo.common.exception.ErrorCodeConstants;
import com.example.demo.common.exception.TwinBusinessException;
import com.example.demo.modules.facerecognition.entity.FaceDebugPhoto;
import com.example.demo.modules.facerecognition.mapper.FaceDebugPhotoMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.File;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@Service
public class FaceDebugService {

    private static final Logger log = LoggerFactory.getLogger(FaceDebugService.class);

    private final FaceDebugPhotoMapper debugPhotoMapper;

    @Value("${app.upload.base-dir:uploads}")
    private String uploadBaseDir;

    @Value("${app.public-base-url:http://localhost:8080}")
    private String publicBaseUrl;

    public FaceDebugService(FaceDebugPhotoMapper debugPhotoMapper) {
        this.debugPhotoMapper = debugPhotoMapper;
    }

    public FaceDebugPhoto upload(String label, MultipartFile file) {
        try {
            String dateDir = LocalDate.now().toString();
            String ext = resolveExtension(file.getOriginalFilename());
            String storageKey = "face-debug/" + dateDir + "/" + UUID.randomUUID() + ext;

            Path targetDir = Path.of(uploadBaseDir, "face-debug", dateDir);
            Files.createDirectories(targetDir);
            Path targetPath = Path.of(uploadBaseDir, storageKey);
            try (InputStream in = file.getInputStream()) {
                Files.copy(in, targetPath, StandardCopyOption.REPLACE_EXISTING);
            }

            FaceDebugPhoto photo = new FaceDebugPhoto();
            photo.setLabel(label != null && !label.isBlank() ? label : file.getOriginalFilename());
            photo.setStorageKey(storageKey);
            photo.setPublicUrl(publicBaseUrl + "/api/upload/files/" + storageKey);
            photo.setOriginalName(file.getOriginalFilename());
            photo.setMimeType(file.getContentType());
            photo.setSizeBytes(file.getSize());
            debugPhotoMapper.insert(photo);

            log.info("Face debug photo uploaded: id={}, label={}", photo.getId(), photo.getLabel());
            return photo;
        } catch (Exception e) {
            log.error("Failed to upload debug photo", e);
            throw new TwinBusinessException(ErrorCodeConstants.INTERNAL_ERROR, "上传调试照片失败: " + e.getMessage());
        }
    }

    public List<FaceDebugPhoto> listAll() {
        return debugPhotoMapper.findAll();
    }

    public void delete(Long id) {
        FaceDebugPhoto photo = debugPhotoMapper.findById(id);
        if (photo == null) {
            throw new TwinBusinessException(ErrorCodeConstants.NOT_FOUND, "调试照片不存在");
        }
        try {
            Path filePath = Path.of(uploadBaseDir, photo.getStorageKey());
            Files.deleteIfExists(filePath);
        } catch (Exception e) {
            log.warn("Failed to delete debug photo file: {}", photo.getStorageKey(), e);
        }
        debugPhotoMapper.deleteById(id);
    }

    private String resolveExtension(String originalName) {
        if (originalName == null) return ".jpg";
        int dot = originalName.lastIndexOf('.');
        return dot >= 0 ? originalName.substring(dot).toLowerCase() : ".jpg";
    }
}
