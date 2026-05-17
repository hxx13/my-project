package com.example.demo.modules.analytics.dto;

import java.util.Map;

public class AnalyticsUserViewUpsertRequest {
    private String reportKey;
    private String name;
    private Map<String, Object> filter;
    private Boolean defaultView;
    private Boolean subscribed;
    private Integer sortOrder;
    /** 订阅时是否回填历史清算（需 subscribed=true） */
    private Boolean backfillHistory;
    /** 回溯截止日 yyyy-MM-dd（含） */
    private String backfillUntil;

    public String getReportKey() {
        return reportKey;
    }

    public void setReportKey(String reportKey) {
        this.reportKey = reportKey;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public Map<String, Object> getFilter() {
        return filter;
    }

    public void setFilter(Map<String, Object> filter) {
        this.filter = filter;
    }

    public Boolean getDefaultView() {
        return defaultView;
    }

    public void setDefaultView(Boolean defaultView) {
        this.defaultView = defaultView;
    }

    public Boolean getSubscribed() {
        return subscribed;
    }

    public void setSubscribed(Boolean subscribed) {
        this.subscribed = subscribed;
    }

    public Integer getSortOrder() {
        return sortOrder;
    }

    public void setSortOrder(Integer sortOrder) {
        this.sortOrder = sortOrder;
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
