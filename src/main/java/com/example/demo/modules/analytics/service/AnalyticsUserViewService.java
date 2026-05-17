package com.example.demo.modules.analytics.service;

import com.example.demo.modules.analytics.dto.AnalyticsUserViewDto;
import com.example.demo.modules.analytics.dto.AnalyticsUserViewUpsertRequest;
import com.example.demo.modules.analytics.entity.AnalyticsUserView;
import com.example.demo.modules.analytics.mapper.AnalyticsUserViewMapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
public class AnalyticsUserViewService {

    private static final Logger log = LoggerFactory.getLogger(AnalyticsUserViewService.class);

    private final AnalyticsUserViewMapper mapper;
    private final AnalyticsReportRegistry reportRegistry;
    private final ObjectMapper objectMapper;
    private final AnalyticsAuditTriggerSupport auditTriggerSupport;

    public AnalyticsUserViewService(
            AnalyticsUserViewMapper mapper,
            AnalyticsReportRegistry reportRegistry,
            ObjectMapper objectMapper,
            AnalyticsAuditTriggerSupport auditTriggerSupport) {
        this.mapper = mapper;
        this.reportRegistry = reportRegistry;
        this.objectMapper = objectMapper;
        this.auditTriggerSupport = auditTriggerSupport;
    }

    public List<AnalyticsUserViewDto> listForUser(String userId, String reportKey) {
        String rk = normalizeReportKey(reportKey);
        return mapper.selectByUserAndReport(userId, rk).stream()
                .map(this::toDto)
                .collect(Collectors.toList());
    }

    public AnalyticsUserViewDto getForUser(String userId, long viewId) {
        AnalyticsUserView row = mapper.selectByIdAndUser(viewId, userId);
        if (row == null) {
            throw new IllegalArgumentException("配置不存在");
        }
        return toDto(row);
    }

    @Transactional
    public AnalyticsUserViewDto create(String userId, AnalyticsUserViewUpsertRequest body) {
        validateUpsert(body);
        AnalyticsUserView row = new AnalyticsUserView();
        row.setUserId(userId);
        row.setReportKey(body.getReportKey().trim());
        row.setName(body.getName().trim());
        row.setFilterJson(writeFilter(body.getFilter()));
        boolean asDefault = Boolean.TRUE.equals(body.getDefaultView());
        boolean subscribed = Boolean.TRUE.equals(body.getSubscribed());
        row.setIsDefault(asDefault ? 1 : 0);
        row.setIsSubscribed(subscribed ? 1 : 0);
        row.setSortOrder(body.getSortOrder() != null ? body.getSortOrder() : 0);
        if (asDefault) {
            mapper.clearDefaultForReport(userId, row.getReportKey());
        }
        mapper.insert(row);
        if (subscribed) {
            triggerAudit(row, body.getBackfillHistory(), body.getBackfillUntil());
        }
        return toDto(row);
    }

    @Transactional
    public AnalyticsUserViewDto update(String userId, long id, AnalyticsUserViewUpsertRequest body) {
        AnalyticsUserView existing = mapper.selectByIdAndUser(id, userId);
        if (existing == null) {
            throw new IllegalArgumentException("订阅视图不存在");
        }
        if (body.getName() != null && StringUtils.hasText(body.getName())) {
            existing.setName(body.getName().trim());
        }
        if (body.getFilter() != null) {
            existing.setFilterJson(writeFilter(body.getFilter()));
        }
        if (body.getSortOrder() != null) {
            existing.setSortOrder(body.getSortOrder());
        }
        if (body.getDefaultView() != null) {
            boolean asDefault = body.getDefaultView();
            if (asDefault) {
                mapper.clearDefaultForReport(userId, existing.getReportKey());
            }
            existing.setIsDefault(asDefault ? 1 : 0);
        }
        boolean wasSubscribed = existing.getIsSubscribed() != null && existing.getIsSubscribed() == 1;
        if (body.getSubscribed() != null) {
            existing.setIsSubscribed(body.getSubscribed() ? 1 : 0);
        }
        mapper.update(existing);
        AnalyticsUserView refreshed = mapper.selectByIdAndUser(id, userId);
        if (!wasSubscribed && refreshed.getIsSubscribed() != null && refreshed.getIsSubscribed() == 1) {
            triggerAudit(refreshed, body.getBackfillHistory(), body.getBackfillUntil());
        }
        return toDto(refreshed);
    }

    @Transactional
    public void delete(String userId, long id) {
        int n = mapper.deleteByIdAndUser(id, userId);
        if (n == 0) {
            throw new IllegalArgumentException("订阅视图不存在");
        }
    }

    /**
     * 订阅：保存筛选并开启自动审计（不取消其他已订阅项）。
     */
    @Transactional
    public AnalyticsUserViewDto subscribe(String userId, AnalyticsUserViewUpsertRequest body) {
        if (body == null || !StringUtils.hasText(body.getReportKey())) {
            throw new IllegalArgumentException("reportKey 不能为空");
        }
        if (!reportRegistry.isKnownReport(body.getReportKey())) {
            throw new IllegalArgumentException("未知报表: " + body.getReportKey());
        }
        if (body.getFilter() == null || body.getFilter().isEmpty()) {
            throw new IllegalArgumentException("筛选条件不能为空");
        }
        if (!StringUtils.hasText(body.getName())) {
            body.setName("订阅 " + java.time.LocalDateTime.now().toString().substring(0, 16).replace('T', ' '));
        }
        body.setSubscribed(true);
        if (body.getDefaultView() == null) {
            body.setDefaultView(false);
        }
        return create(userId, body);
    }

    @Transactional
    public AnalyticsUserViewDto setSubscription(
            String userId, long id, boolean subscribed, Boolean backfillHistory, String backfillUntil) {
        AnalyticsUserView existing = mapper.selectByIdAndUser(id, userId);
        if (existing == null) {
            throw new IllegalArgumentException("视图不存在");
        }
        boolean wasSubscribed = existing.getIsSubscribed() != null && existing.getIsSubscribed() == 1;
        mapper.setSubscribed(id, userId, subscribed ? 1 : 0);
        AnalyticsUserView refreshed = mapper.selectByIdAndUser(id, userId);
        if (subscribed && !wasSubscribed) {
            triggerAudit(refreshed, backfillHistory, backfillUntil);
        } else if (subscribed && Boolean.TRUE.equals(backfillHistory)) {
            triggerBackfillOnly(refreshed, backfillUntil);
        }
        return toDto(refreshed);
    }

    private void triggerAudit(AnalyticsUserView row, Boolean backfillHistory, String backfillUntil) {
        auditTriggerSupport.scheduleAuditAndBackfill(
                row.getId(), row.getUserId(), Boolean.TRUE.equals(backfillHistory), backfillUntil);
    }

    private void triggerBackfillOnly(AnalyticsUserView row, String backfillUntil) {
        auditTriggerSupport.scheduleBackfillOnly(row.getId(), row.getUserId(), backfillUntil);
    }

    private void validateUpsert(AnalyticsUserViewUpsertRequest body) {
        if (body == null || !StringUtils.hasText(body.getReportKey())) {
            throw new IllegalArgumentException("reportKey 不能为空");
        }
        if (!reportRegistry.isKnownReport(body.getReportKey())) {
            throw new IllegalArgumentException("未知报表: " + body.getReportKey());
        }
        if (!StringUtils.hasText(body.getName())) {
            throw new IllegalArgumentException("视图名称不能为空");
        }
        if (body.getFilter() == null || body.getFilter().isEmpty()) {
            throw new IllegalArgumentException("筛选条件不能为空");
        }
    }

    private String normalizeReportKey(String reportKey) {
        if (!StringUtils.hasText(reportKey)) {
            throw new IllegalArgumentException("reportKey 不能为空");
        }
        String rk = reportKey.trim();
        if (!reportRegistry.isKnownReport(rk)) {
            throw new IllegalArgumentException("未知报表: " + rk);
        }
        return rk;
    }

    private AnalyticsUserViewDto toDto(AnalyticsUserView row) {
        AnalyticsUserViewDto dto = new AnalyticsUserViewDto();
        dto.setId(row.getId());
        dto.setReportKey(row.getReportKey());
        dto.setName(row.getName());
        dto.setFilter(readFilter(row.getFilterJson()));
        dto.setDefaultView(row.getIsDefault() != null && row.getIsDefault() == 1);
        dto.setSubscribed(row.getIsSubscribed() != null && row.getIsSubscribed() == 1);
        dto.setSortOrder(row.getSortOrder() != null ? row.getSortOrder() : 0);
        dto.setCreatedAt(row.getCreatedAt());
        dto.setUpdatedAt(row.getUpdatedAt());
        return dto;
    }

    private Map<String, Object> readFilter(String json) {
        if (!StringUtils.hasText(json)) {
            return Collections.emptyMap();
        }
        try {
            return objectMapper.readValue(json, new TypeReference<>() {});
        } catch (Exception e) {
            return Collections.emptyMap();
        }
    }

    private String writeFilter(Map<String, Object> filter) {
        try {
            return objectMapper.writeValueAsString(filter != null ? filter : Collections.emptyMap());
        } catch (Exception e) {
            throw new IllegalArgumentException("筛选条件 JSON 无效");
        }
    }
}
