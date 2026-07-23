package com.example.demo.modules.facerecognition.entity;

import java.time.LocalDateTime;

public class FaceVerifyAuditRecord {

    private Long id;
    private String userId;
    private String sessionId;
    private Boolean matched;
    private Double similarity;
    private Double matchThreshold;
    private Double rejectThreshold;
    private String modelVersion;
    private String challengeAction;
    private String source;
    private Integer baselineCount;
    private Long bestBaselineId;
    private Boolean probeFaceDetected;
    private String probeImageUrls;
    private String bestBaselineImageUrl;
    private String topSimsJson;
    private LocalDateTime createdAt;
    /** 查询联表展示，非持久化 */
    private String userName;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }
    public String getSessionId() { return sessionId; }
    public void setSessionId(String sessionId) { this.sessionId = sessionId; }
    public Boolean getMatched() { return matched; }
    public void setMatched(Boolean matched) { this.matched = matched; }
    public Double getSimilarity() { return similarity; }
    public void setSimilarity(Double similarity) { this.similarity = similarity; }
    public Double getMatchThreshold() { return matchThreshold; }
    public void setMatchThreshold(Double matchThreshold) { this.matchThreshold = matchThreshold; }
    public Double getRejectThreshold() { return rejectThreshold; }
    public void setRejectThreshold(Double rejectThreshold) { this.rejectThreshold = rejectThreshold; }
    public String getModelVersion() { return modelVersion; }
    public void setModelVersion(String modelVersion) { this.modelVersion = modelVersion; }
    public String getChallengeAction() { return challengeAction; }
    public void setChallengeAction(String challengeAction) { this.challengeAction = challengeAction; }
    public String getSource() { return source; }
    public void setSource(String source) { this.source = source; }
    public Integer getBaselineCount() { return baselineCount; }
    public void setBaselineCount(Integer baselineCount) { this.baselineCount = baselineCount; }
    public Long getBestBaselineId() { return bestBaselineId; }
    public void setBestBaselineId(Long bestBaselineId) { this.bestBaselineId = bestBaselineId; }
    public Boolean getProbeFaceDetected() { return probeFaceDetected; }
    public void setProbeFaceDetected(Boolean probeFaceDetected) { this.probeFaceDetected = probeFaceDetected; }
    public String getProbeImageUrls() { return probeImageUrls; }
    public void setProbeImageUrls(String probeImageUrls) { this.probeImageUrls = probeImageUrls; }
    public String getBestBaselineImageUrl() { return bestBaselineImageUrl; }
    public void setBestBaselineImageUrl(String bestBaselineImageUrl) { this.bestBaselineImageUrl = bestBaselineImageUrl; }
    public String getTopSimsJson() { return topSimsJson; }
    public void setTopSimsJson(String topSimsJson) { this.topSimsJson = topSimsJson; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
    public String getUserName() { return userName; }
    public void setUserName(String userName) { this.userName = userName; }
}
