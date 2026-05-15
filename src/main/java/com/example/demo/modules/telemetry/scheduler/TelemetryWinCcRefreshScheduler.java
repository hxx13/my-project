package com.example.demo.modules.telemetry.scheduler;

import com.example.demo.modules.telemetry.config.WinCcProperties;
import com.example.demo.modules.telemetry.service.TelemetrySnapshotService;
import com.example.demo.modules.twin.service.JobSchedulerService;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * WinCC 内存快照后台拉取。
 * <ul>
 *   <li>定时管理中 {@code TELEMETRY_WINCC_UI} <strong>开启</strong>时：仅在周计划+时间窗内、按该行「轮询(秒)」间隔拉取<strong>测量值</strong>（不含限值点名）；</li>
 *   <li>该行<strong>关闭</strong>时：回退为 {@code app.wincc.refresh-interval-ms} 固定间隔（兼容未配定时前行为）。</li>
 * </ul>
 * database 源下点名见 {@code TelemetryWatchlistDbService#loadMeasurementWinccVariableNamesFromDb()}；{@code TELEMETRY_WINCC_LIMITS_UI} 仍为调度占位（已不再访问 WinCC，动物房限值见全局表）。
 */
@Component
@ConditionalOnProperty(prefix = "app.wincc", name = "enabled", havingValue = "true")
public class TelemetryWinCcRefreshScheduler {

    private final TelemetrySnapshotService telemetrySnapshotService;
    private final JobSchedulerService jobSchedulerService;
    private final WinCcProperties winCcProperties;

    private volatile long lastRefreshStartMillis = 0L;

    public TelemetryWinCcRefreshScheduler(TelemetrySnapshotService telemetrySnapshotService,
                                          JobSchedulerService jobSchedulerService,
                                          WinCcProperties winCcProperties) {
        this.telemetrySnapshotService = telemetrySnapshotService;
        this.jobSchedulerService = jobSchedulerService;
        this.winCcProperties = winCcProperties;
    }

    @Scheduled(
            fixedDelayString = "${app.wincc.scheduler-tick-ms:5000}",
            scheduler = "winCcTelemetryTaskScheduler"
    )
    public void refresh() {
        long now = System.currentTimeMillis();
        long minGapMs;
        if (jobSchedulerService.isWinccTelemetryMasterSchedulePullEnabled()) {
            if (!jobSchedulerService.isWinccTelemetryScheduleInEffectNow()) {
                return;
            }
            minGapMs = jobSchedulerService.getWinccTelemetryScheduledPollSeconds() * 1000L;
        } else {
            minGapMs = Math.max(5_000L, winCcProperties.getRefreshIntervalMs());
        }
        if (now - lastRefreshStartMillis < minGapMs) {
            return;
        }
        lastRefreshStartMillis = now;
        telemetrySnapshotService.refreshFromWinCc();
    }
}
