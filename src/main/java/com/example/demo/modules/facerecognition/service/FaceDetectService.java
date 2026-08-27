package com.example.demo.modules.facerecognition.service;

import ai.djl.modality.cv.Image;
import ai.djl.modality.cv.output.DetectedObjects;
import ai.djl.repository.zoo.Criteria;
import ai.djl.repository.zoo.ModelZoo;
import ai.djl.repository.zoo.ZooModel;
import com.example.demo.modules.facerecognition.djl.FaceDetectionTranslator;
import com.example.demo.modules.facerecognition.support.PredictorPool;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.annotation.PreDestroy;

@Service
public class FaceDetectService {

    private static final Logger log = LoggerFactory.getLogger(FaceDetectService.class);

    private final FaceModelPathResolver modelPathResolver;

    @Value("${app.face.inference.predictor-pool-size:2}")
    private int predictorPoolSize;

    @Value("${app.face.inference.predictor-borrow-timeout-ms:60000}")
    private long predictorBorrowTimeoutMs;

    private ZooModel<Image, DetectedObjects> detectModel;
    private PredictorPool<Image, DetectedObjects> detectorPool;

    private final Object initLock = new Object();
    private volatile boolean initialized = false;
    private volatile String initError = null;

    public FaceDetectService(FaceModelPathResolver modelPathResolver) {
        this.modelPathResolver = modelPathResolver;
    }

    /** 懒加载：首次人脸检测时才同步加载 UltraNet 检测模型，避免每次启动白付 PyTorch 原生库加载成本 */
    private void ensureReady() {
        if (initialized || initError != null) {
            return;
        }
        synchronized (initLock) {
            if (initialized || initError != null) {
                return;
            }
            try {
                String modelUrl = modelPathResolver.resolveUltraNetModel();
                Criteria<Image, DetectedObjects> criteria = Criteria.builder()
                        .setTypes(Image.class, DetectedObjects.class)
                        .optModelUrls(modelUrl)
                        .optTranslator(FaceDetectionTranslator.ultraLightDefaults())
                        .optEngine("PyTorch")
                        .build();
                detectModel = ModelZoo.loadModel(criteria);
                detectorPool = new PredictorPool<>(predictorPoolSize, detectModel::newPredictor);
                initialized = true;
                log.info("[FaceDetect] UltraNet 检测模型懒加载完成");
            } catch (Exception e) {
                initError = e.getMessage();
                log.error("[FaceDetect] UltraNet 检测模型懒加载失败: {}", e.getMessage(), e);
            }
        }
    }

    @PreDestroy
    public void destroy() {
        if (detectorPool != null) detectorPool.close();
        if (detectModel != null) detectModel.close();
    }

    public boolean isReady() {
        return initialized;
    }

    public String getInitError() {
        return initError;
    }

    public boolean waitUntilReady(long timeoutMs) {
        ensureReady();
        return initialized;
    }

    /** 检测并裁剪人脸；检测器未就绪或无人脸时返回 null（首次调用触发懒加载） */
    public Image detectAndCropFace(Image img) {
        if (img == null) {
            return null;
        }
        ensureReady();
        if (!initialized || detectorPool == null) {
            return null;
        }
        try {
            DetectedObjects detections = detectorPool.predict(img, predictorBorrowTimeoutMs);
            DetectedObjects.DetectedObject face = FaceAlignUtil.pickLargestFace(detections);
            if (face == null) {
                return null;
            }
            return FaceAlignUtil.cropFace(img, face);
        } catch (Exception e) {
            log.debug("[FaceDetect] 检测失败: {}", e.getMessage());
            return null;
        }
    }
}
