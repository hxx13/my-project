package com.example.demo.modules.notification.dto;

/**
 * 按业务单维度标记已读（同一 bizType+bizId 下当前用户全部收件通知）。
 */
public class MarkReadByBizRequest {
    private String bizType;
    private String bizId;

    public String getBizType() {
        return bizType;
    }

    public void setBizType(String bizType) {
        this.bizType = bizType;
    }

    public String getBizId() {
        return bizId;
    }

    public void setBizId(String bizId) {
        this.bizId = bizId;
    }
}
