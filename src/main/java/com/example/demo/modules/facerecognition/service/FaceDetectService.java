package com.example.demo.modules.facerecognition.service;

import ai.djl.modality.cv.Image;
import ai.djl.modality.cv.output.DetectedObjects;
import ai.djl.repository.zoo.Criteria;
import ai.djl.repository.zoo.ModelZoo;
import ai.djl.repository.zoo.ZooModel;
import com.example.demo.common.logging.banner.LoadingSpinner;
import ai.djl.training.util.ProgressBar;
import com.example.demo.modules.facerecognition.djl.FaceDetectionTranslator;
import com.example.demo.modules.facerecognition.support.PredictorPool;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.annotation.PostConstruct;
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

    @PostConstruct
    public void init() {
        new Thread(() -> {
            try {
                synchronized (initLock) {
                    String modelUrl = modelPathResolver.resolveUltraNetModel();
                    Criteria<Image, DetectedObjects> criteria = Criteria.builder()
                            .setTypes(Image.class, DetectedObjects.class)
                            .optModelUrls(modelUrl)
                            .optTranslator(FaceDetectionTranslator.ultraLightDefaults())
                            .optEngine("PyTorch")
                            .build();
                    LoadingSpinner.run("人脸检测模型 (UltraNet)", () -> {
                        try { detectModel = ModelZoo.loadModel(criteria); }
                        catch (Exception e) { throw new RuntimeException(e); }
                        detectorPool = new PredictorPool<>(predictorPoolSize, detectModel::newPredictor);
                        initialized = true;
                    });
                }
            } catch (Exception e) {
                initError = e.getMessage();
                log.error("[FaceDetect] 加载失败: {}", e.getMessage(), e);
            } finally {
                synchronized (initLock) {
                    initLock.notifyAll();
                }
            }
        }, "face-detect-loader").start();
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
        if (initialized) return true;
        if (initError != null) return false;
        long deadline = System.currentTimeMillis() + Math.max(0, timeoutMs);
        synchronized (initLock) {
            while (!initialized && initError == null && System.currentTimeMillis() < deadline) {
                long remain = deadline - System.currentTimeMillis();
                if (remain <= 0) break;
                try {
                    initLock.wait(Math.min(500, remain));
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    break;
                }
            }
        }
        return initialized;
    }

    /** 检测并裁剪人脸；检测器未就绪或无人脸时返回 null */
    public Image detectAndCropFace(Image img) {
        if (img == null || !initialized || detectorPool == null) {
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
