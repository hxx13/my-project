package com.example.demo.modules.facerecognition.service;

import com.example.demo.common.config.JwtTokenService;
import com.example.demo.common.exception.ErrorCodeConstants;
import com.example.demo.common.exception.TwinBusinessException;
import com.example.demo.modules.facerecognition.dto.FaceVerifyResultDTO;
import com.example.demo.modules.facerecognition.entity.FaceBaselineRecord;
import com.example.demo.modules.facerecognition.entity.FaceVerifyAuditRecord;
import com.example.demo.modules.facerecognition.mapper.FaceBaselineRecordMapper;
import com.example.demo.modules.facerecognition.mapper.FaceVerifyAuditMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.List;

@Service
public class FaceVerifyService {

    private static final Logger log = LoggerFactory.getLogger(FaceVerifyService.class);

    private final FaceCompareService compareService;
    private final FaceBaselineRecordMapper baselineMapper;
    private final FaceVerifyAuditMapper auditMapper;
    private final FaceAuthConfigService configService;
    private final JwtTokenService jwtTokenService;
    private final FaceVerifyImageStorageService imageStorageService;
    private final FaceInferenceGate inferenceGate;

    public FaceVerifyService(
            FaceCompareService compareService,
            FaceBaselineRecordMapper baselineMapper,
            FaceVerifyAuditMapper auditMapper,
            FaceAuthConfigService configService,
            JwtTokenService jwtTokenService,
            FaceVerifyImageStorageService imageStorageService,
            FaceInferenceGate inferenceGate) {
        this.compareService = compareService;
        this.baselineMapper = baselineMapper;
        this.auditMapper = auditMapper;
        this.configService = configService;
        this.jwtTokenService = jwtTokenService;
        this.imageStorageService = imageStorageService;
        this.inferenceGate = inferenceGate;
    }

    /**
     * 服务端 1:1 验证：活体通过后上传 1～2 帧，与底库多张比对。
     * 无论通过/拒绝/无人脸，只要进入比对流程均写入 face_verify_audit（供自动化日志展示）。
     */
    public FaceVerifyResultDTO verify(
            String userId,
            String sessionId,
            String challengeAction,
            String source,
            List<byte[]> probeFrames) {
        if (!StringUtils.hasText(userId)) {
            throw new TwinBusinessException(ErrorCodeConstants.BAD_REQUEST, "userId 不能为空");
        }
        if (probeFrames == null || probeFrames.isEmpty()) {
            throw new TwinBusinessException(ErrorCodeConstants.BAD_REQUEST, "请上传至少一帧抓拍照片");
        }

        String uid = userId.trim();
        double matchThreshold = configService.getVerifyMatchThreshold(source);
        double rejectThreshold = configService.getVerifyRejectThreshold(source);

        if (!compareService.waitUntilReady(90_000)) {
            String err = compareService.getInitError();
            if (StringUtils.hasText(err)) {
                throw new TwinBusinessException(ErrorCodeConstants.FACE_MODEL_NOT_READY,
                        "人脸比对模型加载失败: " + err);
            }
            throw new TwinBusinessException(ErrorCodeConstants.FACE_MODEL_NOT_READY,
                    "人脸比对模型尚未就绪（首次启动需下载模型，请稍后重试）");
        }

        List<FaceBaselineRecord> records = baselineMapper.findAllByUserId(uid);
        if (records.isEmpty()) {
            throw new TwinBusinessException(ErrorCodeConstants.FACE_VERIFY_NO_BASELINE, "该人员暂无底库照片");
        }

        List<FaceCompareService.BaselineTarget> targets = new ArrayList<>();
        for (FaceBaselineRecord r : records) {
            targets.add(new FaceCompareService.BaselineTarget(r.getId(), r.getFaceImageUrl()));
        }

        List<String> probeImageUrls = saveProbeFramesSafely(uid, sessionId, probeFrames);

        FaceCompareService.MultiCompareResult cmp;
        try {
            cmp = inferenceGate.runVerify(() -> compareService.compareProbeToBaselines(probeFrames, targets));
        } catch (Exception e) {
            log.error("[FaceVerify] 比对失败 userId={}: {}", uid, e.getMessage(), e);
            persistAudit(uid, sessionId, challengeAction, source, records.size(),
                    probeImageUrls, null, false, null, matchThreshold, rejectThreshold,
                    false, List.of(), null, "compare_error");
            throw new TwinBusinessException(ErrorCodeConstants.INTERNAL_ERROR, "人脸比对失败: " + e.getMessage());
        }

        if (!cmp.probeFaceDetected()) {
            persistAudit(uid, sessionId, challengeAction, source, records.size(),
                    probeImageUrls, null, false, 0.0, matchThreshold, rejectThreshold,
                    false, List.of(), null, null);
            throw new TwinBusinessException(ErrorCodeConstants.FACE_VERIFY_NO_FACE, "抓拍帧中未检测到人脸");
        }

        double sim = cmp.similarity();
        boolean matched = sim >= matchThreshold;
        boolean rejected = sim < rejectThreshold;

        String verifyToken = null;
        if (matched) {
            verifyToken = jwtTokenService.generateFaceVerifyToken(uid, sessionId, sim);
        }

        String bestBaselineImageUrl = resolveBaselineImageUrl(cmp.bestBaselineId(), records);

        FaceVerifyResultDTO dto = new FaceVerifyResultDTO();
        dto.setMatched(matched);
        dto.setRejected(rejected);
        dto.setSimilarity(sim);
        dto.setMatchThreshold(matchThreshold);
        dto.setRejectThreshold(rejectThreshold);
        dto.setModelVersion(FaceCompareService.MODEL_VERSION);
        dto.setVerifyToken(verifyToken);
        dto.setBestBaselineId(cmp.bestBaselineId());
        dto.setTopSims(cmp.topSims());
        dto.setBaselineCount(records.size());
        dto.setProbeFaceDetected(true);

        persistAudit(uid, sessionId, challengeAction, source, records.size(),
                probeImageUrls, bestBaselineImageUrl, matched, sim, matchThreshold, rejectThreshold,
                true, cmp.topSims(), cmp.bestBaselineId(), null);

        FaceCompareService.consoleVerifyResult(
                uid, source, challengeAction, sim, matchThreshold, rejectThreshold,
                matched, rejected, records.size(), cmp.topSims());
        log.info("[FaceVerify] userId={} sim={} matched={} rejected={} baselines={} model={}",
                uid, String.format("%.4f", sim), matched, rejected, records.size(), FaceCompareService.MODEL_VERSION);
        return dto;
    }

    private List<String> saveProbeFramesSafely(String userId, String sessionId, List<byte[]> probeFrames) {
        try {
            return imageStorageService.saveProbeFrames(
                    userId, sessionId, probeFrames, existingProbeCount(userId, sessionId));
        } catch (Exception e) {
            log.warn("[FaceVerify] 抓拍图保存失败 userId={}: {}", userId, e.getMessage());
            return List.of();
        }
    }

    private int existingProbeCount(String userId, String sessionId) {
        if (!StringUtils.hasText(sessionId)) {
            return 0;
        }
        FaceVerifyAuditRecord existing = auditMapper.findByUserIdAndSessionId(userId.trim(), sessionId.trim());
        if (existing == null) {
            return 0;
        }
        return FaceVerifyAuditAdminService.countProbeUrls(existing.getProbeImageUrls());
    }

    private static String resolveBaselineImageUrl(Long bestBaselineId, List<FaceBaselineRecord> records) {
        if (bestBaselineId == null || records == null) {
            return records != null && !records.isEmpty() ? records.get(0).getFaceImageUrl() : null;
        }
        for (FaceBaselineRecord r : records) {
            if (bestBaselineId.equals(r.getId())) {
                return r.getFaceImageUrl();
            }
        }
        return records.isEmpty() ? null : records.get(0).getFaceImageUrl();
    }

    private void persistAudit(
            String userId,
            String sessionId,
            String challengeAction,
            String source,
            int baselineCount,
            List<String> probeImageUrls,
            String bestBaselineImageUrl,
            boolean matched,
            Double similarity,
            double matchThreshold,
            double rejectThreshold,
            boolean probeFaceDetected,
            List<Double> topSims,
            Long bestBaselineId,
            String auditNote) {
        try {
            FaceVerifyAuditRecord row = new FaceVerifyAuditRecord();
            row.setUserId(userId);
            row.setSessionId(sessionId);
            row.setMatched(matched);
            row.setSimilarity(similarity);
            row.setMatchThreshold(matchThreshold);
            row.setRejectThreshold(rejectThreshold);
            row.setModelVersion(FaceCompareService.MODEL_VERSION);
            row.setChallengeAction(challengeAction);
            row.setSource(source);
            row.setBaselineCount(baselineCount);
            row.setBestBaselineId(bestBaselineId);
            row.setProbeFaceDetected(probeFaceDetected);
            row.setTopSimsJson(FaceVerifyAuditAdminService.toTopSimsJson(topSims));

            if (StringUtils.hasText(sessionId)) {
                FaceVerifyAuditRecord existing = auditMapper.findByUserIdAndSessionId(userId.trim(), sessionId.trim());
                if (existing != null) {
                    List<String> mergedUrls = FaceVerifyAuditAdminService.mergeProbeUrls(
                            existing.getProbeImageUrls(), probeImageUrls);
                    row.setId(existing.getId());
                    row.setProbeImageUrls(FaceVerifyAuditAdminService.toProbeUrlsJson(mergedUrls));
                    row.setMatched(Boolean.TRUE.equals(existing.getMatched()) || matched);
                    double prevSim = existing.getSimilarity() != null ? existing.getSimilarity() : -1;
                    double newSim = similarity != null ? similarity : -1;
                    if (newSim >= prevSim) {
                        row.setSimilarity(similarity);
                        row.setBestBaselineId(bestBaselineId != null ? bestBaselineId : existing.getBestBaselineId());
                        row.setBestBaselineImageUrl(
                                bestBaselineImageUrl != null ? bestBaselineImageUrl : existing.getBestBaselineImageUrl());
                        row.setProbeFaceDetected(probeFaceDetected || Boolean.TRUE.equals(existing.getProbeFaceDetected()));
                    } else {
                        row.setSimilarity(existing.getSimilarity());
                        row.setBestBaselineId(existing.getBestBaselineId());
                        row.setBestBaselineImageUrl(existing.getBestBaselineImageUrl());
                        row.setProbeFaceDetected(Boolean.TRUE.equals(existing.getProbeFaceDetected()));
                    }
                    if (auditNote != null && !auditNote.isBlank()) {
                        row.setTopSimsJson(appendAuditNote(row.getTopSimsJson(), auditNote));
                    }
                    auditMapper.updateMerged(row);
                    return;
                }
            }

            row.setProbeImageUrls(FaceVerifyAuditAdminService.toProbeUrlsJson(probeImageUrls));
            row.setBestBaselineImageUrl(bestBaselineImageUrl);
            if (auditNote != null && !auditNote.isBlank()) {
                row.setTopSimsJson(auditNote);
            }
            auditMapper.insert(row);
        } catch (Exception e) {
            log.warn("[FaceVerify] 审计写入失败 userId={}: {}", userId, e.getMessage());
        }
    }

    private static String appendAuditNote(String topSimsJson, String note) {
        if (topSimsJson == null || topSimsJson.isBlank()) {
            return note;
        }
        return topSimsJson + " | " + note;
    }
}
