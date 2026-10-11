package com.example.demo.modules.ai.scheduler;

import com.example.demo.modules.ai.service.AiLearnRunner;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 学习批处理的**节拍器** —— 到点喊一声 {@link AiLearnRunner#runIfDue()}，跑不跑由它自己判。
 *
 * <h2>为什么排在这里，而不是「多久跑一次」</h2>
 * 触发条件不在本类里，在 runner 里：**「够格的新说法够数」且「冷却期满」**（设计 §12.2）。
 * 所以这里的 cron 只是**来看一眼**的时机，不是学习频率 —— 一天来三次，绝大多数时候是空手而归，
 * 这是设计如此，不是浪费。
 *
 * <h2>为什么钉在 01:07 / 13:07 / 20:07</h2>
 * 高峰时段是**工作日 9–12 与 14–18**，其余按半价计费（设计 §1.1）。这三个点都在高峰之外，
 * 同一次学习成本直接减半，**不额外付出任何代价**（设计 §12.11）。
 * 刻意避开整点：全站几十个定时任务已经占着整点，没必要再挤进去。
 *
 * <h2>为什么一天三次而不是更多</h2>
 * 学习一次就改一次提示词，**每改一次全体用户的缓存前缀失效一次**（设计 §1.1）。
 * 冷却期是 12 小时，一天能真正学成的本来就只有一次上下，多喊也白喊。
 */
@Component
public class AiLearnScheduler {

    private static final Logger log = LoggerFactory.getLogger(AiLearnScheduler.class);

    private final AiLearnRunner learnRunner;

    public AiLearnScheduler(AiLearnRunner learnRunner) {
        this.learnRunner = learnRunner;
    }

    /** 到点来看一眼：够条件就学，不够就散。 */
    @Scheduled(cron = "0 7 1,13,20 * * ?", zone = "Asia/Shanghai")
    public void tick() {
        try {
            int n = learnRunner.runIfDue();
            if (n > 0) {
                log.info("[ai-learn] 本轮吸收 {} 条（观察中）", n);
            }
        } catch (Exception e) {
            // 不能让它抛出去：全站定时任务共用调度池，一条抛出去会连累后面所有人的任务
            log.error("[ai-learn] 学习批处理失败: {}", e.getMessage(), e);
        }
    }
}
