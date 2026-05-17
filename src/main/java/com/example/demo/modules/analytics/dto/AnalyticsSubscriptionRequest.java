package com.example.demo.modules.analytics.dto;

/**
 * 开启/关闭订阅；可选一次性回填历史清算记录。
 */
public class AnalyticsSubscriptionRequest {
    private Boolean subscribed;
    /** 是否从 backfillUntil 起向当前补齐历史记录 */
    private Boolean backfillHistory;
    /** 回溯截止日（含），格式 yyyy-MM-dd */
    private String backfillUntil;

    public Boolean getSubscribed() {
        return subscribed;
    }

    public void setSubscribed(Boolean subscribed) {
        this.subscribed = subscribed;
    }

    public Boolean getBackfillHistory() {
        return backfillHistory;
    }

    public void setBackfillHistory(Boolean backfillHistory) {
        this.backfillHistory = backfillHistory;
    }

    public String getBackfillUntil() {
        return backfillUntil;
    }

    public void setBackfillUntil(String backfillUntil) {
        this.backfillUntil = backfillUntil;
    }
}
