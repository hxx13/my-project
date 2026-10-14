package com.example.demo.modules.broadcast.scheduler;

import com.example.demo.modules.broadcast.service.BroadcastPlanService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * 广播定时播放引擎 —— **这是我方接管调度的落点**。
 *
 * <p>原平台的定时不可靠（实测：播放日志连续 8 天零播放，且只执行「当前方案」）。
 * 这里由我方每轮扫一遍自己的方案表，到点就通过 {@code DsppaClient} 下发播放指令，
 * 平台降级为「播放终端控制器」。
 *
 * <p>开关节制在 {@code app.broadcast.enabled}：这是**唯一会让现场出声**的组件，
 * 出问题时可以单独关掉它而不影响连接与查询接口。
 *
 * <p>跑在广播模块独占的线程池上（{@code broadcastTaskScheduler}），不挤占门禁/大华那些既有定时任务。
 */
@Component
@ConditionalOnProperty(prefix = "app.broadcast", name = "enabled", havingValue = "true", matchIfMissing = true)
public class BroadcastPlaybackScheduler {

    private static final Logger log = LoggerFactory.getLogger(BroadcastPlaybackScheduler.class);

    private final BroadcastPlanService planService;

    public BroadcastPlaybackScheduler(BroadcastPlanService planService) {
        this.planService = planService;
    }

    @Scheduled(fixedDelayString = "${app.broadcast.tick-ms:10000}",
            initialDelayString = "${app.broadcast.tick-initial-delay-ms:30000}",
            scheduler = "broadcastTaskScheduler")
    public void tick() {
        try {
            List<String> acted = planService.tick();
            for (String line : acted) {
                log.info("[广播定时] {}", line);
            }
        } catch (Exception e) {
            // 定时任务不能因为一轮异常就停摆
            log.warn("[广播定时] 本轮异常: {}", e.getMessage());
        }
    }
}
