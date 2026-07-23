package com.example.demo.modules.cageshelf.entity;

import java.time.LocalDateTime;

/**
 * 笼位特殊状态持续告警配置。
 * 独立于 TwinViolationRule 违规系统，轻量级全局阈值。
 */
public class CageAlertConfig {

    private Long id;
    private String statusCode;
    private String statusLabel;
    private Integer thresholdDays;
    private Integer enabled;       // 0=禁用, 1=启用
    private String mode;           // auto=自动对比, manual=手动选择
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getStatusCode() { return statusCode; }
    public void setStatusCode(String statusCode) { this.statusCode = statusCode; }

    public String getStatusLabel() { return statusLabel; }
    public void setStatusLabel(String statusLabel) { this.statusLabel = statusLabel; }

    public Integer getThresholdDays() { return thresholdDays; }
    public void setThresholdDays(Integer thresholdDays) { this.thresholdDays = thresholdDays; }

    public Integer getEnabled() { return enabled; }
    public void setEnabled(Integer enabled) { this.enabled = enabled; }

    public String getMode() { return mode; }
    public void setMode(String mode) { this.mode = mode; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}
