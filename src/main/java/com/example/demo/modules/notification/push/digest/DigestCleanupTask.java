package com.example.demo.modules.notification.push.digest;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;

/**
 * 聚合明细（{@code notify_digest_item}）定期清理。
 *
 * <p>这张表只增不减：写入方每轮 flush 只删自己的 PENDING、再插新的，历史 SENT 永久留着 ——
 * 实测已积到 7.5 万行（绝大多数是遥测报警的明细），而读侧只有「待发清单」一个消费方，
 * 只查 PENDING，SENT 纯粹是残渣。
 *
 * <p><b>只删 SENT</b>：PENDING 是还没投出去的，删了等于丢通知。
 * <b>分片删</b>：首次跑要清积压，一条 DELETE 扫几万行会长时间占锁，把正在跑的投递和写入卡住；
 * 每次 LIMIT 一批、循环删到空，走 {@code idx_status_time(status, create_time)}。
 */
@Component
public class DigestCleanupTask {

    private static final Logger log = LoggerFactory.getLogger(DigestCleanupTask.class);

    /** ponytail: 单轮批数上限（batchRows × 这个数），防积压特别大时一轮跑太久；真清不完再加水位线。 */
    private static final int MAX_BATCHES = 200;

    private final NotifyDigestItemMapper mapper;

    /** 保留天数：SENT 且 create_time 早于 now - 保留天数 才删。 */
    @Value("${app.notify-digest.sent-retention-days:7}")
    private int retentionDays;

    /** 每批删多少行。 */
    @Value("${app.notify-digest.cleanup-batch-rows:5000}")
    private int batchRows;

    public DigestCleanupTask(NotifyDigestItemMapper mapper) {
        this.mapper = mapper;
    }

    @Scheduled(initialDelayString = "${app.notify-digest.cleanup-initial-delay-ms:120000}",
            fixedDelayString = "${app.notify-digest.cleanup-interval-ms:86400000}")
    public void cleanup() {
        int days = Math.max(retentionDays, 1);
        int batch = Math.max(batchRows, 1);
        LocalDateTime before = LocalDateTime.now().minusDays(days);
        int total = 0;
        try {
            for (int i = 0; i < MAX_BATCHES; i++) {
                int n = mapper.deleteSentBefore(before, batch);
                if (n <= 0) break;
                total += n;
            }
        } catch (Exception e) {
            log.warn("[digest-cleanup] 清理失败: {}", e.getMessage());
            return;
        }
        if (total > 0) {
            log.info("[digest-cleanup] 已清理 {} 天前的已发送明细 {} 行", days, total);
        }
    }
}
