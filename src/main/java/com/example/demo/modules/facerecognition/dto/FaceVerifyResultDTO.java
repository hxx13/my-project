package com.example.demo.modules.facerecognition.dto;

import java.util.List;

/** 服务端 1:1 人脸验证结果（路线 B） */
public class FaceVerifyResultDTO {

    private boolean matched;
    /** 强拒绝：相似度低于 reject 线，客户端可立即失败 */
    private boolean rejected;
    private double similarity;
    private double matchThreshold;
    private double rejectThreshold;
    private String modelVersion;
    private String verifyToken;
    private Long bestBaselineId;
    private List<Double> topSims;
    private int baselineCount;
    private boolean probeFaceDetected;

    public boolean isMatched() { return matched; }
    public void setMatched(boolean matched) { this.matched = matched; }
    public boolean isRejected() { return rejected; }
    public void setRejected(boolean rejected) { this.rejected = rejected; }
    public double getSimilarity() { return similarity; }
    public void setSimilarity(double similarity) { this.similarity = similarity; }
    public double getMatchThreshold() { return matchThreshold; }
    public void setMatchThreshold(double matchThreshold) { this.matchThreshold = matchThreshold; }
    public double getRejectThreshold() { return rejectThreshold; }
    public void setRejectThreshold(double rejectThreshold) { this.rejectThreshold = rejectThreshold; }
    public String getModelVersion() { return modelVersion; }
    public void setModelVersion(String modelVersion) { this.modelVersion = modelVersion; }
    public String getVerifyToken() { return verifyToken; }
    public void setVerifyToken(String verifyToken) { this.verifyToken = verifyToken; }
    public Long getBestBaselineId() { return bestBaselineId; }
    public void setBestBaselineId(Long bestBaselineId) { this.bestBaselineId = bestBaselineId; }
    public List<Double> getTopSims() { return topSims; }
    public void setTopSims(List<Double> topSims) { this.topSims = topSims; }
    public int getBaselineCount() { return baselineCount; }
    public void setBaselineCount(int baselineCount) { this.baselineCount = baselineCount; }
    public boolean isProbeFaceDetected() { return probeFaceDetected; }
    public void setProbeFaceDetected(boolean probeFaceDetected) { this.probeFaceDetected = probeFaceDetected; }
}
