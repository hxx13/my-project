package com.example.demo.modules.twin.entity;

import java.time.LocalDateTime;

/**
 * 孪生在调用 ARO 登记接口前后写入的待匹配行：官方流水批量落库后按 user/room/类型/时间窗消费并写入 aro_access_log.feed_*。
 */
public class TwinAccessCorrelationPending {
    private Long id;
    /** 与 ARO 接口一致：1=进入 2=离开 */
    private Integer accessType;
    private String userId;
    private String roomId;
    /** 如 AUTO_SIGNOUT、WEB_SCAN */
    private String sourceTag;
    private Long automationLogId;
    private String summaryZh;
    private String detailZh;
    private LocalDateTime opTime;
    private Integer consumed;

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Integer getAccessType() {
        return accessType;
    }

    public void setAccessType(Integer accessType) {
        this.accessType = accessType;
    }

    public String getUserId() {
        return userId;
    }

    public void setUserId(String userId) {
        this.userId = userId;
    }

    public String getRoomId() {
        return roomId;
    }

    public void setRoomId(String roomId) {
        this.roomId = roomId;
    }

    public String getSourceTag() {
        return sourceTag;
    }

    public void setSourceTag(String sourceTag) {
        this.sourceTag = sourceTag;
    }

    public Long getAutomationLogId() {
        return automationLogId;
    }

    public void setAutomationLogId(Long automationLogId) {
        this.automationLogId = automationLogId;
    }

    public String getSummaryZh() {
        return summaryZh;
    }

    public void setSummaryZh(String summaryZh) {
        this.summaryZh = summaryZh;
    }

    public String getDetailZh() {
        return detailZh;
    }

    public void setDetailZh(String detailZh) {
        this.detailZh = detailZh;
    }

    public LocalDateTime getOpTime() {
        return opTime;
    }

    public void setOpTime(LocalDateTime opTime) {
        this.opTime = opTime;
    }

    public Integer getConsumed() {
        return consumed;
    }

    public void setConsumed(Integer consumed) {
        this.consumed = consumed;
    }
}
