package com.example.demo.modules.print.service;

import com.example.demo.modules.notification.push.dispatch.PushService;
import com.example.demo.modules.print.entity.PrintJob;
import com.example.demo.modules.print.entity.PrintStation;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

/**
 * 打印任务失败提醒。走推送中心（{@code /console/admin/push-config}）的统一源
 * {@link #SOURCE_CODE}，渠道与接收人都在那个页面上配。
 *
 * <p>收件人 = **发起这次打印的人**（{@code createdBy}）。谁发的谁该知道没打出来。
 * 引擎内部还会并集 push-config 里为该源单独配的接收人。
 *
 * <p>本服务绝不抛异常出去。任务已经落库成 FAILED 了，不能被一条消息拖垮 ——
 * 与 {@code CageStatusNotifyService} 同一条原则。
 */
@Service
public class PrintNotifyService {

    /** 统一通知源 code —— 任务失败共用这一个源，模板与收件人都在 push-config 里改。 */
    public static final String SOURCE_CODE = "PRINT_JOB_FAILED";

    private static final Logger log = LoggerFactory.getLogger(PrintNotifyService.class);
    private static final DateTimeFormatter TIME_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");

    private final PushService pushService;
    private final PrintStationService stationService;

    public PrintNotifyService(PushService pushService, PrintStationService stationService) {
        this.pushService = pushService;
        this.stationService = stationService;
    }

    /** 任务落 FAILED 之后调用。reason 为空时给一句兜底文案。 */
    public void notifyFailed(PrintJob job, String reason) {
        if (job == null) return;
        try {
            String stationName = stationService.findById(job.getStationId())
                    .map(PrintStation::getName)
                    .orElse("未命名工位");

            Map<String, String> vars = new LinkedHashMap<>();
            vars.put("fileName", text(job.getFileName(), "（无文件名）"));
            vars.put("stationName", stationName);
            vars.put("reason", text(reason, "工位未回报原因"));
            vars.put("attempts", String.valueOf(job.getAttempts()));
            vars.put("failedAt", LocalDateTime.now().format(TIME_FMT));

            // 收件人：发起人。为空时传 null，交给 push-config 配的接收人
            Set<String> to = job.getCreatedBy() == null || job.getCreatedBy().isBlank()
                    ? null : Set.of(job.getCreatedBy());

            pushService.send(SOURCE_CODE, vars, to);
        } catch (Exception e) {
            log.warn("[print-notify] 任务 {} 失败通知发送失败: {}", job.getId(), e.getMessage());
        }
    }

    private static String text(String v, String fallback) {
        return v == null || v.isBlank() ? fallback : v;
    }
}
