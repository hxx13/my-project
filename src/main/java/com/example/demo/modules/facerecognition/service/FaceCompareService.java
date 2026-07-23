package com.example.demo.modules.facerecognition.service;

import ai.djl.modality.cv.Image;
import ai.djl.modality.cv.ImageFactory;
import ai.djl.modality.cv.util.NDImageUtils;
import ai.djl.ndarray.NDArray;
import ai.djl.ndarray.NDList;
import ai.djl.ndarray.NDManager;
import ai.djl.ndarray.types.DataType;
import ai.djl.repository.zoo.Criteria;
import ai.djl.repository.zoo.ModelZoo;
import ai.djl.repository.zoo.ZooModel;
import com.example.demo.common.logging.banner.LoadingSpinner;
import com.example.demo.modules.facerecognition.support.PredictorPool;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.annotation.PostConstruct;
import javax.annotation.PreDestroy;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 后端人脸比对 — DJL PyTorch FaceNet + UltraNet 检测裁剪 + 磁盘 embedding 缓存
 */
@Service
public class FaceCompareService {

    private static final Logger log = LoggerFactory.getLogger(FaceCompareService.class);

    public static final String MODEL_VERSION = "facenet-pytorch-ultranet-1.6";

    private static final int EMBED_INPUT_SIZE = 160;
    private static final int EMBEDDING_CACHE_MAX = 512;

    private final FaceModelPathResolver modelPathResolver;
    private final FaceDetectService faceDetectService;
    private final FaceEmbeddingDiskCache diskCache;

    @Value("${app.face.inference.predictor-pool-size:2}")
    private int predictorPoolSize;

    @Value("${app.face.inference.predictor-borrow-timeout-ms:60000}")
    private long predictorBorrowTimeoutMs;

    private ZooModel<NDList, NDList> embedModel;
    private PredictorPool<NDList, NDList> embedderPool;

    private final Object initLock = new Object();
    private volatile boolean initialized = false;
    private volatile String initError = null;

    private final Map<String, float[]> embeddingCache = new ConcurrentHashMap<>();

    public FaceCompareService(
            FaceModelPathResolver modelPathResolver,
            FaceDetectService faceDetectService,
            FaceEmbeddingDiskCache diskCache) {
        this.modelPathResolver = modelPathResolver;
        this.faceDetectService = faceDetectService;
        this.diskCache = diskCache;
    }

    private static void consoleError(String message, Throwable t) {
        if (t != null) {
            log.error("[FaceCompare] {}", message, t);
        } else {
            log.error("[FaceCompare] {}", message);
        }
    }

    /** 每次 verify 比对结果：中文逐行输出到控制台 */
    public static void consoleVerifyResult(
            String userId,
            String source,
            String challengeAction,
            double sim,
            double matchThreshold,
            double rejectThreshold,
            boolean matched,
            boolean rejected,
            int baselineCount,
            List<Double> topSims) {
        System.out.println("[人脸比对] 人员ID: " + userId);
        System.out.println("[人脸比对] 来源: " + (source != null && !source.isBlank() ? source : "gate"));
        if (challengeAction != null && !challengeAction.isBlank()) {
            System.out.println("[人脸比对] 活体动作: " + challengeAction);
        }
        System.out.println("[人脸比对] 相似度: " + String.format("%.1f%%", sim * 100));
        System.out.println("[人脸比对] 通过线: ≥" + String.format("%.1f%%", matchThreshold * 100));
        System.out.println("[人脸比对] 拒绝线: <" + String.format("%.1f%%", rejectThreshold * 100));
        System.out.println("[人脸比对] 是否通过: " + (matched ? "是" : "否"));
        System.out.println("[人脸比对] 是否拒绝: " + (rejected ? "是" : "否"));
        System.out.println("[人脸比对] 底库张数: " + baselineCount);
        if (topSims != null && !topSims.isEmpty()) {
            StringBuilder tops = new StringBuilder();
            for (int i = 0; i < topSims.size(); i++) {
                if (i > 0) tops.append(", ");
                tops.append(String.format("%.1f%%", topSims.get(i) * 100));
            }
            System.out.println("[人脸比对] Top相似度: " + tops);
        }
    }

    @PostConstruct
    public void init() {
        final long t0 = System.currentTimeMillis();
        String embedUrl = modelPathResolver.resolveFaceFeatureModel();
        new Thread(() -> {
            try {
                faceDetectService.waitUntilReady(120_000);
                synchronized (initLock) {
                    Criteria<NDList, NDList> embCriteria = Criteria.builder()
                            .setTypes(NDList.class, NDList.class)
                            .optModelUrls(embedUrl)
                            .optModelName("face_feature")
                            .optEngine("PyTorch")
                            .build();
                    LoadingSpinner.run("人脸特征模型 (face_feature)", () -> {
                        try {
                            embedModel = ModelZoo.loadModel(embCriteria);
                        } catch (Exception e) {
                            throw new RuntimeException(e);
                        }
                        embedderPool = new PredictorPool<>(predictorPoolSize, embedModel::newPredictor);
                        initialized = true;
                    });
                }
            } catch (Exception e) {
                initError = e.getMessage();
                consoleError("模型加载失败: " + e.getClass().getSimpleName() + " — " + e.getMessage(), e);
            } finally {
                synchronized (initLock) {
                    initLock.notifyAll();
                }
            }
        }, "face-model-loader").start();
    }

    @PreDestroy
    public void destroy() {
        if (embedderPool != null) embedderPool.close();
        if (embedModel != null) embedModel.close();
    }

    public boolean isReady() {
        return initialized;
    }

    public String getInitError() {
        return initError;
    }

    public String getModelVersion() {
        return MODEL_VERSION;
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

    private void ensureReady() {
        if (initialized) return;
        if (initError != null) {
            throw new IllegalStateException("人脸比对模型未就绪: " + initError);
        }
        synchronized (initLock) {
            if (!initialized && initError == null) {
                try {
                    initLock.wait(120_000);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
            }
        }
        if (!initialized) {
            throw new IllegalStateException("人脸比对模型初始化超时");
        }
    }

    public double compare(String imageUrl1, String imageUrl2) throws Exception {
        ensureReady();
        float[] emb1 = extractEmbeddingFromUrl(imageUrl1);
        float[] emb2 = extractEmbeddingFromUrl(imageUrl2);
        return cosineSimilarity(emb1, emb2);
    }

    public MultiCompareResult compareProbeToBaselines(List<byte[]> probeFrames, List<BaselineTarget> baselines)
            throws Exception {
        ensureReady();
        if (probeFrames == null || probeFrames.isEmpty()) {
            throw new IllegalArgumentException("probeFrames 不能为空");
        }
        if (baselines == null || baselines.isEmpty()) {
            throw new IllegalArgumentException("baselines 不能为空");
        }

        float[][] baselineEmbeddings = new float[baselines.size()][];
        Long[] baselineIds = new Long[baselines.size()];
        for (int i = 0; i < baselines.size(); i++) {
            BaselineTarget b = baselines.get(i);
            baselineIds[i] = b.id();
            baselineEmbeddings[i] = getOrComputeBaselineEmbedding(b.imageUrl());
        }

        double bestSim = -1;
        Long bestBaselineId = null;
        List<Double> bestTopSims = List.of();
        boolean anyFace = false;

        for (byte[] frame : probeFrames) {
            if (frame == null || frame.length == 0) continue;
            float[] probeEmb = extractEmbeddingFromBytes(frame);
            if (probeEmb == null) continue;
            anyFace = true;

            List<SimPair> pairs = new ArrayList<>();
            for (int i = 0; i < baselineEmbeddings.length; i++) {
                double sim = cosineSimilarity(probeEmb, baselineEmbeddings[i]);
                pairs.add(new SimPair(baselineIds[i], sim));
            }
            pairs.sort(Comparator.comparingDouble(SimPair::sim).reversed());

            int topCount = Math.min(2, pairs.size());
            double avgTop = 0;
            for (int i = 0; i < topCount; i++) {
                avgTop += pairs.get(i).sim();
            }
            avgTop /= topCount;

            if (avgTop > bestSim) {
                bestSim = avgTop;
                bestBaselineId = pairs.get(0).id();
                bestTopSims = pairs.stream().limit(topCount).map(SimPair::sim).toList();
            }
        }

        return new MultiCompareResult(
                anyFace ? bestSim : 0,
                bestBaselineId,
                bestTopSims,
                anyFace
        );
    }

    public void invalidateBaselineCache(String imageUrl) {
        if (imageUrl != null) {
            String key = cacheKey(imageUrl);
            embeddingCache.remove(key);
            diskCache.invalidate(key);
        }
    }

    /** 底库上传质检：能否提取有效人脸特征 */
    public boolean canExtractFaceFromBytes(byte[] bytes) {
        try {
            ensureReady();
            return extractEmbeddingFromBytes(bytes) != null;
        } catch (Exception e) {
            return false;
        }
    }

    private float[] getOrComputeBaselineEmbedding(String imageUrl) throws Exception {
        String key = cacheKey(imageUrl);
        float[] cached = embeddingCache.get(key);
        if (cached != null) return cached;
        cached = diskCache.get(key);
        if (cached != null) {
            embeddingCache.put(key, cached);
            return cached;
        }
        float[] emb = extractEmbeddingFromUrl(imageUrl);
        if (emb == null) {
            throw new IOException("底库照片无法提取特征: " + imageUrl);
        }
        if (embeddingCache.size() >= EMBEDDING_CACHE_MAX) {
            embeddingCache.clear();
        }
        embeddingCache.put(key, emb);
        diskCache.put(key, emb);
        return emb;
    }

    private static String cacheKey(String imageUrl) {
        return imageUrl == null ? "" : imageUrl.trim();
    }

    private float[] extractEmbeddingFromUrl(String imageUrl) throws Exception {
        Image img = loadImage(imageUrl);
        return extractEmbeddingFromImage(img);
    }

    private float[] extractEmbeddingFromBytes(byte[] bytes) throws Exception {
        Image img = ImageFactory.getInstance().fromInputStream(new ByteArrayInputStream(bytes));
        return extractEmbeddingFromImage(img);
    }

    private float[] extractEmbeddingFromImage(Image img) throws Exception {
        if (img == null || img.getWidth() <= 0 || img.getHeight() <= 0) {
            return null;
        }
        Image faceCrop = faceDetectService.detectAndCropFace(img);
        if (faceCrop == null) {
            faceCrop = centerFaceCrop(img);
        }
        try (NDManager manager = NDManager.newBaseManager()) {
            NDArray array = faceCrop.toNDArray(manager, Image.Flag.COLOR);
            array = NDImageUtils.resize(array, EMBED_INPUT_SIZE, EMBED_INPUT_SIZE);
            array = array.toType(DataType.FLOAT32, false);
            array = array.div(255f);
            array = array.transpose(2, 0, 1).expandDims(0);
            NDList input = new NDList(array);
            NDList output = embedderPool.predict(input, predictorBorrowTimeoutMs);
            return l2Normalize(output.head().toFloatArray());
        }
    }

    private static float[] l2Normalize(float[] v) {
        if (v == null || v.length == 0) return v;
        double norm = 0;
        for (float x : v) norm += (double) x * x;
        norm = Math.sqrt(norm);
        if (norm <= 0) return v;
        float[] out = new float[v.length];
        for (int i = 0; i < v.length; i++) out[i] = (float) (v[i] / norm);
        return out;
    }

    /** 前置摄像头帧：居中裁剪 75% 作为人脸区域（无检测器时的稳妥兜底） */
    private Image centerFaceCrop(Image img) {
        int imgW = img.getWidth();
        int imgH = img.getHeight();
        int size = (int) (Math.min(imgW, imgH) * 0.75);
        int x = (imgW - size) / 2;
        int y = (imgH - size) / 2;
        return img.getSubImage(x, y, size, size);
    }

    private Image loadImage(String url) throws IOException {
        if (url.startsWith("http://") || url.startsWith("https://")) {
            try (InputStream is = URI.create(url).toURL().openStream()) {
                BufferedImage bi = javax.imageio.ImageIO.read(is);
                if (bi == null) throw new IOException("无法解码图片: " + url);
                return ImageFactory.getInstance().fromImage(bi);
            }
        }
        java.io.File file = new java.io.File(url);
        return ImageFactory.getInstance().fromFile(file.toPath());
    }

    static double cosineSimilarity(float[] a, float[] b) {
        if (a == null || b == null || a.length != b.length) return 0;
        double dot = 0, normA = 0, normB = 0;
        for (int i = 0; i < a.length; i++) {
            dot += (double) a[i] * b[i];
            normA += (double) a[i] * a[i];
            normB += (double) b[i] * b[i];
        }
        double denom = Math.sqrt(normA) * Math.sqrt(normB);
        return denom > 0 ? dot / denom : 0;
    }

    public record BaselineTarget(Long id, String imageUrl) {}

    public record MultiCompareResult(
            double similarity,
            Long bestBaselineId,
            List<Double> topSims,
            boolean probeFaceDetected
    ) {}

    private record SimPair(Long id, double sim) {}
}
