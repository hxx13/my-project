package com.example.demo.modules.facerecognition.service;

import com.example.demo.common.exception.ErrorCodeConstants;
import com.example.demo.common.exception.TwinBusinessException;
import com.example.demo.modules.facerecognition.entity.FaceBaselineRecord;
import com.example.demo.modules.facerecognition.mapper.FaceBaselineRecordMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@Service
public class FaceBaselineService {

    private static final Logger log = LoggerFactory.getLogger(FaceBaselineService.class);

    private final FaceBaselineRecordMapper baselineMapper;
    private final FaceCompareService compareService;

    @Value("${app.upload.base-dir:uploads}")
    private String uploadBaseDir;

    @Value("${app.public-base-url:http://localhost:8080}")
    private String publicBaseUrl;

    public FaceBaselineService(
            FaceBaselineRecordMapper baselineMapper,
            @Lazy FaceCompareService compareService) {
        this.baselineMapper = baselineMapper;
        this.compareService = compareService;
    }

    private static final int MAX_BASELINE_PER_USER = 6;

    /** 添加一张底库照片（服务端人脸质检 + 一人多张上限 6） */
    public FaceBaselineRecord upload(String userId, MultipartFile file) {
        List<FaceBaselineRecord> existing = baselineMapper.findAllByUserId(userId);
        if (existing.size() >= MAX_BASELINE_PER_USER) {
            throw new TwinBusinessException(ErrorCodeConstants.BAD_REQUEST,
                    "底库照片已达上限（" + MAX_BASELINE_PER_USER + " 张），请先删除旧照片");
        }
        Path tempPath = null;
        try {
            byte[] bytes = file.getBytes();
            if (!compareService.canExtractFaceFromBytes(bytes)) {
                throw new TwinBusinessException(ErrorCodeConstants.FACE_BASELINE_NO_FACE,
                        "底库照片未检测到清晰正脸，请重新拍摄（正脸、光线充足、无遮挡）");
            }

            String dateDir = LocalDate.now().toString();
            String ext = resolveExtension(file.getOriginalFilename());
            String storageKey = "face-baseline/" + dateDir + "/" + UUID.randomUUID() + ext;

            Path targetPath = Path.of(uploadBaseDir, storageKey);
            Files.createDirectories(targetPath.getParent());
            Files.write(targetPath, bytes);

            String publicUrl = publicBaseUrl + "/api/upload/files/" + storageKey;

            FaceBaselineRecord record = new FaceBaselineRecord();
            record.setUserId(userId);
            record.setFaceImageUrl(publicUrl);
            record.setStorageKey(storageKey);
            baselineMapper.insert(record);

            compareService.invalidateBaselineCache(publicUrl);
            log.info("Face baseline added: id={}, userId={}", record.getId(), userId);
            return record;
        } catch (TwinBusinessException e) {
            throw e;
        } catch (Exception e) {
            log.error("Failed to upload baseline photo for userId={}", userId, e);
            throw new TwinBusinessException(ErrorCodeConstants.INTERNAL_ERROR, "上传底库照片失败: " + e.getMessage());
        } finally {
            if (tempPath != null) {
                try {
                    Files.deleteIfExists(tempPath);
                } catch (Exception ignored) {
                }
            }
        }
    }

    /** 获取某人的第一张底库（兼容旧接口） */
    public FaceBaselineRecord getByUserId(String userId) {
        return baselineMapper.findByUserId(userId);
    }

    /** 获取某人的全部底库照片 */
    public List<FaceBaselineRecord> getAllByUserId(String userId) {
        return baselineMapper.findAllByUserId(userId);
    }

    /** 删除某人的全部底库 */
    public void deleteByUserId(String userId) {
        List<FaceBaselineRecord> records = baselineMapper.findAllByUserId(userId);
        for (FaceBaselineRecord r : records) {
            try {
                Files.deleteIfExists(Path.of(uploadBaseDir, r.getStorageKey()));
            } catch (Exception e) {
                log.warn("del file fail", e);
            }
            compareService.invalidateBaselineCache(r.getFaceImageUrl());
        }
        baselineMapper.deleteByUserId(userId);
        log.info("All face baselines deleted: userId={}", userId);
    }

    /** 删除单张底库 */
    public void deleteById(Long id) {
        FaceBaselineRecord record = baselineMapper.findById(id);
        if (record == null) return;
        try {
            Files.deleteIfExists(Path.of(uploadBaseDir, record.getStorageKey()));
        } catch (Exception e) {
            log.warn("del file fail", e);
        }
        compareService.invalidateBaselineCache(record.getFaceImageUrl());
        baselineMapper.deleteById(id);
        log.info("Face baseline deleted: id={}", id);
    }

    private String resolveExtension(String originalName) {
        if (originalName == null) return ".jpg";
        int dot = originalName.lastIndexOf('.');
        return dot >= 0 ? originalName.substring(dot).toLowerCase() : ".jpg";
    }
}
