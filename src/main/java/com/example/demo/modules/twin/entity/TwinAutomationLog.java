package com.example.demo.modules.twin.entity;

import java.time.LocalDateTime;

public class TwinAutomationLog {
    private Long id;
    private String automationType;
    private String eventKey;
    private String triggerType;
    private String triggerReason;
    private String userId;
    private String targetId;
    private Integer success;
    private String detail;
    /** 列表/弹窗展示：在 {@link #detail} 基础上展开 state、通道名、房间名等（不入库） */
    private String detailDisplayZh;
    private LocalDateTime eventTime;
    private String createdBy;

    /** 关联 aro_personnel.name，列表展示用 */
    private String userName;
    /** 自动化类型中文（含库表覆盖） */
    private String automationTypeLabel;
    private String eventKeyLabel;
    private String triggerTypeLabel;
    private String triggerReasonLabel;

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getAutomationType() {
        return automationType;
    }

    public void setAutomationType(String automationType) {
        this.automationType = automationType;
    }

    public String getEventKey() {
        return eventKey;
    }

    public void setEventKey(String eventKey) {
        this.eventKey = eventKey;
    }

    public String getTriggerType() {
        return triggerType;
    }

    public void setTriggerType(String triggerType) {
        this.triggerType = triggerType;
    }

    public String getTriggerReason() {
        return triggerReason;
    }

    public void setTriggerReason(String triggerReason) {
        this.triggerReason = triggerReason;
    }

    public String getUserId() {
        return userId;
    }

    public void setUserId(String userId) {
        this.userId = userId;
    }

    public String getTargetId() {
        return targetId;
    }

    public void setTargetId(String targetId) {
        this.targetId = targetId;
    }

    public Integer getSuccess() {
        return success;
    }

    public void setSuccess(Integer success) {
        this.success = success;
    }

    public String getDetail() {
        return detail;
    }

    public void setDetail(String detail) {
        this.detail = detail;
    }

    public String getDetailDisplayZh() {
        return detailDisplayZh;
    }

    public void setDetailDisplayZh(String detailDisplayZh) {
        this.detailDisplayZh = detailDisplayZh;
    }

    public LocalDateTime getEventTime() {
        return eventTime;
    }

    public void setEventTime(LocalDateTime eventTime) {
        this.eventTime = eventTime;
    }

    public String getCreatedBy() {
        return createdBy;
    }

    public void setCreatedBy(String createdBy) {
        this.createdBy = createdBy;
    }

    public String getUserName() {
        return userName;
    }

    public void setUserName(String userName) {
        this.userName = userName;
    }

    public String getAutomationTypeLabel() {
        return automationTypeLabel;
    }

    public void setAutomationTypeLabel(String automationTypeLabel) {
        this.automationTypeLabel = automationTypeLabel;
    }

    public String getEventKeyLabel() {
        return eventKeyLabel;
    }

    public void setEventKeyLabel(String eventKeyLabel) {
        this.eventKeyLabel = eventKeyLabel;
    }

    public String getTriggerTypeLabel() {
        return triggerTypeLabel;
    }

    public void setTriggerTypeLabel(String triggerTypeLabel) {
        this.triggerTypeLabel = triggerTypeLabel;
    }

    public String getTriggerReasonLabel() {
        return triggerReasonLabel;
    }

    public void setTriggerReasonLabel(String triggerReasonLabel) {
        this.triggerReasonLabel = triggerReasonLabel;
    }
}
