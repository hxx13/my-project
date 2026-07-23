package com.example.demo.modules.twin.scan.scheduler;

import com.example.demo.modules.twin.scan.service.PreGeneratedConversationService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

/**
 * 用户对话存档调度器：周期性检测所有已使用（consumed）/无对话的用户，为其重新生成对话。
 * 每次调度最多处理 20 人，避免 LLM API 过载。剩余用户下次调度继续。
 */
@Component
public class UserConversationScheduler {

    private static final Logger log = LoggerFactory.getLogger(UserConversationScheduler.class);
    private static final int MAX_PER_CYCLE = 20;

    private final PreGeneratedConversationService preGenService;

    public UserConversationScheduler(PreGeneratedConversationService preGenService) {
        this.preGenService = preGenService;
    }

    /** 每 30 分钟检测一次，为 consumed/无对话的用户补生成 */
    @Scheduled(fixedRate = 30 * 60_000, initialDelay = 5 * 60_000)
    public void scheduledRegenerateConsumed() {
        try {
            List<Map<String, Object>> eligible = preGenService.findEligibleUsers();
            int processed = 0;
            int success = 0;
            int skipped = 0;

            for (Map<String, Object> user : eligible) {
                if (processed >= MAX_PER_CYCLE) break;
                String uid = stringVal(user.get("userId"));
                if (uid.isEmpty()) continue;

                if (!preGenService.needsGeneration(uid)) {
                    skipped++;
                    continue;
                }
                processed++;
                try {
                    String name = stringVal(user.get("name"));
                    preGenService.generateArchiveEntry(uid, name);
                    success++;
                } catch (Exception e) {
                    log.warn("[archive-scheduler] generate failed userId={}: {}", uid, e.getMessage());
                }
                // 每处理 5 人停顿 2s 避免 LLM 限流
                if (processed % 5 == 0) {
                    try { Thread.sleep(2000); } catch (InterruptedException ignored) {}
                }
            }

            if (processed > 0 || skipped > 0) {
                log.warn("[archive-scheduler] cycle done: processed={} success={} skipped={} eligible={}",
                        processed, success, skipped, eligible.size());
            }
        } catch (Exception e) {
            log.error("[archive-scheduler] cycle failed: {}", e.getMessage(), e);
        }
    }

    private static String stringVal(Object v) {
        return v == null ? "" : String.valueOf(v).trim();
    }
}
