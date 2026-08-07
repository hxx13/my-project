package com.example.demo.modules.cageshelf.entity;

/**
 * Outbox 投递箱记录 — 本地变更后异步可靠推送 ARO。
 */
public class OutboxRecord {
    private Long id;
    private String aggregateType;   // cage_cell / cage_claim
    private String aggregateId;      // animalCageId 等
    private String eventType;        // cell_updated / claim_created
    private String payload;          // JSON 变更快照
    private String aroEndpoint;      // 目标 ARO 端点标识
    private String aroUrl;           // 实际调用的 ARO 接口地址（投递时填充）
    private String summary;          // 操作摘要：谁在哪个笼架对哪个笼位做了什么
    private String status;           // pending/processing/delivered/failed/dead
    private Integer retryCount;
    private String nextRetryAt;
    private String lastError;
    private String aroResponse;
    private String createdAt;
    private String deliveredAt;

    public Long getId() { return id; }
    public void setId(Long v) { this.id = v; }
    public String getAggregateType() { return aggregateType; }
    public void setAggregateType(String v) { this.aggregateType = v; }
    public String getAggregateId() { return aggregateId; }
    public void setAggregateId(String v) { this.aggregateId = v; }
    public String getEventType() { return eventType; }
    public void setEventType(String v) { this.eventType = v; }
    public String getPayload() { return payload; }
    public void setPayload(String v) { this.payload = v; }
    public String getAroEndpoint() { return aroEndpoint; }
    public void setAroEndpoint(String v) { this.aroEndpoint = v; }
    public String getAroUrl() { return aroUrl; }
    public void setAroUrl(String v) { this.aroUrl = v; }
    public String getSummary() { return summary; }
    public void setSummary(String v) { this.summary = v; }
    public String getStatus() { return status; }
    public void setStatus(String v) { this.status = v; }
    public Integer getRetryCount() { return retryCount; }
    public void setRetryCount(Integer v) { this.retryCount = v; }
    public String getNextRetryAt() { return nextRetryAt; }
    public void setNextRetryAt(String v) { this.nextRetryAt = v; }
    public String getLastError() { return lastError; }
    public void setLastError(String v) { this.lastError = v; }
    public String getAroResponse() { return aroResponse; }
    public void setAroResponse(String v) { this.aroResponse = v; }
    public String getCreatedAt() { return createdAt; }
    public void setCreatedAt(String v) { this.createdAt = v; }
    public String getDeliveredAt() { return deliveredAt; }
    public void setDeliveredAt(String v) { this.deliveredAt = v; }
}
