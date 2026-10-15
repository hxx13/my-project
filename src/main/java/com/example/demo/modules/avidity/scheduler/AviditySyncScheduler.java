package com.example.demo.modules.avidity.scheduler;

import com.example.demo.modules.avidity.service.AvidityAlarmService;
import com.example.demo.modules.avidity.service.AviditySyncService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 定时把安维迪仪表盘的通道/告警数据拉回本地库，落库之后再判一轮要不要推送报警。
 *
 * <p>两件事都挂在同一轮里、顺序执行：报警判定读的是刚落库的数据，所以必须排在同步之后。
 * 判定本身不联网（推送除外），失败只影响这一轮。
 *
 * <p>开关节制在 {@code app.avidity.enabled}；关掉后既不登录也不拉数，
 * 查询接口仍可读库里存量。跑在模块独占线程池上，不挤占门禁/大华/广播那些既有定时任务。
 */
@Component
@ConditionalOnProperty(prefix = "app.avidity", name = "enabled", havingValue = "true", matchIfMissing = true)
public class AviditySyncScheduler {

    private static final Logger log = LoggerFactory.getLogger(AviditySyncScheduler.class);

    private final AviditySyncService syncService;
    private final AvidityAlarmService alarmService;

    public AviditySyncScheduler(AviditySyncService syncService, AvidityAlarmService alarmService) {
        this.syncService = syncService;
        this.alarmService = alarmService;
    }

    @Scheduled(fixedDelayString = "${app.avidity.sync-interval-ms:300000}",
            initialDelayString = "${app.avidity.sync-initial-delay-ms:60000}",
            scheduler = "avidityTaskScheduler")
    public void tick() {
        try {
            syncService.syncAll();
        } catch (Exception e) {
            // 定时任务不能因为一轮异常就停摆（对方站点偶发超时是常态）
            log.warn("[安维迪同步] 本轮异常: {}", e.getMessage());
            return;
        }
        try {
            alarmService.evaluate();
        } catch (Exception e) {
            log.warn("[安维迪报警] 本轮判定异常: {}", e.getMessage());
        }
        // 厂平台那份历史流水已舍弃：报警历史改由我们自己按实时状态记（AvidityAlarmEventService）
    }
}
