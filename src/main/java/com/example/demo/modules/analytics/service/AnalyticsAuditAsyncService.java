package com.example.demo.modules.analytics.service;

import com.example.demo.modules.analytics.entity.AnalyticsUserView;
import com.example.demo.modules.analytics.mapper.AnalyticsUserViewMapper;
import com.example.demo.modules.analytics.service.AnalyticsReportRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDate;

/**
 * 清算/历史回填在后台线程执行，避免订阅接口阻塞 HTTP 超时。
 */
@Service
public class AnalyticsAuditAsyncService {

    private static final Logger log = LoggerFactory.getLogger(AnalyticsAuditAsyncService.class);

    private final AnalyticsUserViewMapper userViewMapper;
    private final AnalyticsAuditService auditService;

    public AnalyticsAuditAsyncService(AnalyticsUserViewMapper userViewMapper, AnalyticsAuditService auditService) {
        this.userViewMapper = userViewMapper;
        this.auditService = auditService;
    }

    @Async("heavyCalcExecutor")
    public void runAuditAndBackfillAsync(
            long viewId, String userId, boolean backfillHistory, String backfillUntil) {
        AnalyticsUserView view = loadSubscribedView(viewId, userId);
        if (view == null) {
            return;
        }
        try {
            boolean cage = view != null && AnalyticsReportRegistry.REPORT_CAGE_OCCUPANCY.equals(view.getReportKey());
            boolean doBackfill = backfillHistory && !cage && StringUtils.hasText(backfillUntil);
            log.debug("[analytics-audit] async start viewId={} backfill={}", viewId, doBackfill);
            auditService.runAuditForView(view);
            if (doBackfill) {
                LocalDate until = auditService.parseBackfillUntil(backfillUntil);
                auditService.backfillAuditForView(view, until);
            }
            log.debug("[analytics-audit] async done viewId={}", viewId);
        } catch (Exception e) {
            log.warn("[analytics-audit] async failed viewId={}: {}", viewId, e.getMessage(), e);
        }
    }

    @Async("heavyCalcExecutor")
    public void refreshSnapshotsAsync(long viewId, String userId) {
        AnalyticsUserView view = loadSubscribedView(viewId, userId);
        if (view == null) {
            return;
        }
        try {
            log.debug("[analytics-audit] async refresh start viewId={}", viewId);
            auditService.refreshAllSnapshotsForView(view);
            log.debug("[analytics-audit] async refresh done viewId={}", viewId);
        } catch (Exception e) {
            log.warn("[analytics-audit] async refresh failed viewId={}: {}", viewId, e.getMessage(), e);
        }
    }

    @Async("heavyCalcExecutor")
    public void backfillOnlyAsync(long viewId, String userId, String backfillUntil) {
        AnalyticsUserView view = loadSubscribedView(viewId, userId);
        if (view == null) {
            return;
        }
        try {
            log.debug("[analytics-audit] async backfill start viewId={}", viewId);
            LocalDate until = auditService.parseBackfillUntil(backfillUntil);
            auditService.backfillAuditForView(view, until);
            log.debug("[analytics-audit] async backfill done viewId={}", viewId);
        } catch (Exception e) {
            log.warn("[analytics-audit] async backfill failed viewId={}: {}", viewId, e.getMessage(), e);
        }
    }

    private AnalyticsUserView loadSubscribedView(long viewId, String userId) {
        AnalyticsUserView view = userViewMapper.selectByIdAndUser(viewId, userId);
        if (view == null) {
            log.warn("[analytics-audit] view not found viewId={} userId={}", viewId, userId);
            return null;
        }
        if (view.getIsSubscribed() == null || view.getIsSubscribed() != 1) {
            log.warn("[analytics-audit] view not subscribed viewId={}", viewId);
            return null;
        }
        return view;
    }
}
