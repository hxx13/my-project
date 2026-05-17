package com.example.demo.modules.analytics.service;

import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * 在事务提交后再触发后台清算，避免异步线程读不到刚插入/更新的订阅配置。
 */
@Component
public class AnalyticsAuditTriggerSupport {

    private final AnalyticsAuditService auditService;
    private final AnalyticsAuditAsyncService auditAsyncService;

    public AnalyticsAuditTriggerSupport(
            AnalyticsAuditService auditService, AnalyticsAuditAsyncService auditAsyncService) {
        this.auditService = auditService;
        this.auditAsyncService = auditAsyncService;
    }

    public void scheduleAuditAndBackfill(
            long viewId, String userId, boolean backfillHistory, String backfillUntil) {
        if (backfillHistory) {
            auditService.parseBackfillUntil(backfillUntil);
        }
        Runnable task = () ->
                auditAsyncService.runAuditAndBackfillAsync(viewId, userId, backfillHistory, backfillUntil);
        runAfterCommit(task);
    }

    public void scheduleBackfillOnly(long viewId, String userId, String backfillUntil) {
        auditService.parseBackfillUntil(backfillUntil);
        Runnable task = () -> auditAsyncService.backfillOnlyAsync(viewId, userId, backfillUntil);
        runAfterCommit(task);
    }

    private static void runAfterCommit(Runnable task) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    task.run();
                }
            });
        } else {
            task.run();
        }
    }
}
