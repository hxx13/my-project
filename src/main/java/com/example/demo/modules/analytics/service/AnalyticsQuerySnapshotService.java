package com.example.demo.modules.analytics.service;

import com.example.demo.modules.analytics.entity.AnalyticsQuerySnapshot;
import com.example.demo.modules.analytics.entity.AnalyticsUserView;
import com.example.demo.modules.analytics.mapper.AnalyticsQuerySnapshotMapper;
import com.example.demo.modules.analytics.mapper.AnalyticsUserViewMapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.List;
import java.util.Map;

@Service
public class AnalyticsQuerySnapshotService {

    public static final String REPORT_ISOLATION = "isolation_usage";

    private final AnalyticsQuerySnapshotMapper snapshotMapper;
    private final AnalyticsUserViewMapper userViewMapper;
    private final IsolationUsageReportService reportService;
    private final ObjectMapper objectMapper;

    public AnalyticsQuerySnapshotService(
            AnalyticsQuerySnapshotMapper snapshotMapper,
            AnalyticsUserViewMapper userViewMapper,
            IsolationUsageReportService reportService,
            ObjectMapper objectMapper) {
        this.snapshotMapper = snapshotMapper;
        this.userViewMapper = userViewMapper;
        this.reportService = reportService;
        this.objectMapper = objectMapper;
    }

    @Transactional(readOnly = true)
    public Map<String, Object> queryWithSnapshot(
            String userId,
            long viewId,
            String periodKey,
            String queryCycle,
            String startTime,
            String endTime,
            boolean forceRefresh) {
        if (!StringUtils.hasText(periodKey)) {
            throw new IllegalArgumentException("无效的历史周期");
        }
        AnalyticsUserView view = userViewMapper.selectByIdAndUser(viewId, userId);
        if (view == null) {
            throw new IllegalArgumentException("筛选配置不存在");
        }
        if (!forceRefresh) {
            AnalyticsQuerySnapshot cached = snapshotMapper.selectByViewPeriod(
                    userId, viewId, REPORT_ISOLATION, periodKey);
            if (cached != null && StringUtils.hasText(cached.getReportJson())) {
                return readReport(cached.getReportJson());
            }
        } else {
            snapshotMapper.deleteByViewPeriod(userId, viewId, REPORT_ISOLATION, periodKey);
        }
        AnalyticsFilterParams params = AnalyticsFilterParams.fromMap(readFilter(view.getFilterJson()));
        Map<String, Object> report = reportService.queryWithFilter(params, startTime, endTime);
        report.put("fromSnapshot", false);
        report.put("periodKey", periodKey);
        report.put("periodLabel", periodKey);
        saveSnapshot(userId, viewId, periodKey, queryCycle, view.getFilterJson(), report);
        return report;
    }

    private void saveSnapshot(
            String userId,
            long viewId,
            String periodKey,
            String queryCycle,
            String filterJson,
            Map<String, Object> report) {
        try {
            AnalyticsQuerySnapshot row = new AnalyticsQuerySnapshot();
            row.setUserId(userId);
            row.setViewId(viewId);
            row.setReportKey(REPORT_ISOLATION);
            row.setPeriodKey(periodKey);
            row.setQueryCycle(queryCycle != null ? queryCycle : "");
            row.setFilterJson(filterJson);
            row.setReportJson(objectMapper.writeValueAsString(report));
            snapshotMapper.insert(row);
        } catch (Exception e) {
            // 并发重复插入时忽略，下次查询仍可读已有快照
        }
    }

    private Map<String, Object> readReport(String json) {
        try {
            Map<String, Object> report = objectMapper.readValue(json, new TypeReference<>() {});
            report.put("fromSnapshot", true);
            return report;
        } catch (Exception e) {
            throw new IllegalStateException("快照数据损坏");
        }
    }

    private Map<String, Object> readFilter(String json) {
        if (!StringUtils.hasText(json)) {
            return Map.of();
        }
        try {
            return objectMapper.readValue(json, new TypeReference<>() {});
        } catch (Exception e) {
            return Map.of();
        }
    }
}
