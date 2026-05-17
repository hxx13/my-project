package com.example.demo.modules.analytics.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

public class AnalyticsAuditLogDto {
    private Long id;
    private Long viewId;
    private String reportKey;
    private String viewName;
    private String periodType;
    private String periodLabel;
    private LocalDateTime currentStart;
    private LocalDateTime currentEnd;
    private LocalDateTime previousStart;
    private LocalDateTime previousEnd;
    private Long currentRounds;
    private Long previousRounds;
    private Integer currentUsers;
    private Integer previousUsers;
    private Integer currentGroups;
    private Integer previousGroups;
    private Long deltaRounds;
    private BigDecimal deltaPct;
    private List<Map<String, Object>> topGroups;
    private LocalDateTime createdAt;

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Long getViewId() {
        return viewId;
    }

    public void setViewId(Long viewId) {
        this.viewId = viewId;
    }

    public String getReportKey() {
        return reportKey;
    }

    public void setReportKey(String reportKey) {
        this.reportKey = reportKey;
    }

    public String getViewName() {
        return viewName;
    }

    public void setViewName(String viewName) {
        this.viewName = viewName;
    }

    public String getPeriodType() {
        return periodType;
    }

    public void setPeriodType(String periodType) {
        this.periodType = periodType;
    }

    public String getPeriodLabel() {
        return periodLabel;
    }

    public void setPeriodLabel(String periodLabel) {
        this.periodLabel = periodLabel;
    }

    public LocalDateTime getCurrentStart() {
        return currentStart;
    }

    public void setCurrentStart(LocalDateTime currentStart) {
        this.currentStart = currentStart;
    }

    public LocalDateTime getCurrentEnd() {
        return currentEnd;
    }

    public void setCurrentEnd(LocalDateTime currentEnd) {
        this.currentEnd = currentEnd;
    }

    public LocalDateTime getPreviousStart() {
        return previousStart;
    }

    public void setPreviousStart(LocalDateTime previousStart) {
        this.previousStart = previousStart;
    }

    public LocalDateTime getPreviousEnd() {
        return previousEnd;
    }

    public void setPreviousEnd(LocalDateTime previousEnd) {
        this.previousEnd = previousEnd;
    }

    public Long getCurrentRounds() {
        return currentRounds;
    }

    public void setCurrentRounds(Long currentRounds) {
        this.currentRounds = currentRounds;
    }

    public Long getPreviousRounds() {
        return previousRounds;
    }

    public void setPreviousRounds(Long previousRounds) {
        this.previousRounds = previousRounds;
    }

    public Integer getCurrentUsers() {
        return currentUsers;
    }

    public void setCurrentUsers(Integer currentUsers) {
        this.currentUsers = currentUsers;
    }

    public Integer getPreviousUsers() {
        return previousUsers;
    }

    public void setPreviousUsers(Integer previousUsers) {
        this.previousUsers = previousUsers;
    }

    public Integer getCurrentGroups() {
        return currentGroups;
    }

    public void setCurrentGroups(Integer currentGroups) {
        this.currentGroups = currentGroups;
    }

    public Integer getPreviousGroups() {
        return previousGroups;
    }

    public void setPreviousGroups(Integer previousGroups) {
        this.previousGroups = previousGroups;
    }

    public Long getDeltaRounds() {
        return deltaRounds;
    }

    public void setDeltaRounds(Long deltaRounds) {
        this.deltaRounds = deltaRounds;
    }

    public BigDecimal getDeltaPct() {
        return deltaPct;
    }

    public void setDeltaPct(BigDecimal deltaPct) {
        this.deltaPct = deltaPct;
    }

    public List<Map<String, Object>> getTopGroups() {
        return topGroups;
    }

    public void setTopGroups(List<Map<String, Object>> topGroups) {
        this.topGroups = topGroups;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }
}
