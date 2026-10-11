package com.example.demo.modules.ai.watch.entity;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * 一个**条件触发器**：当「检查出来的条件」成立时，执行一个动作。
 *
 * <p>与 {@code AiTimer} 的区别是**触发源**：定时器到点就执行，本表要先把条件查出来。
 * 所以多了 check_* 那几列，而 fire_at 换成了 next_check_at + started_at。
 *
 * <h2>判「比开始时多了」而不是「大于 0」</h2>
 * {@code baselineValue} 是**建计划时那次检查的取值**。写成「>0」有两个坑：
 * ① 盯之前就发生过的事会被当成刚发生；② 记录可能晚一两分钟才落库，窗口若按「上次检查→现在」
 * 滑动，晚到的记录会掉进两窗之间的缝里、永远查不到。
 * 窗口从 {@code startedAt} 一直开到「现在」（只增不减）+ 比基线，两个坑都没有。
 */
@Data
public class AiWatch {

    /** 盯着中。 */
    public static final String WATCHING = "WATCHING";
    /** 条件成立、动作已执行。 */
    public static final String DONE = "DONE";
    /** 到超时上限还没成立，放弃。 */
    public static final String EXPIRED = "EXPIRED";
    /** 建单人主动取消。 */
    public static final String CANCELLED = "CANCELLED";
    /** 检查本身出错（工具没了、权限被收）—— 与 EXPIRED 分开，因为处置不同。 */
    public static final String FAILED = "FAILED";

    private Long id;
    private String ownerUserId;
    private String ownerNameSnapshot;
    private Long sessionId;
    private Long messageId;
    /** 人话说明，例如「大厅开门后开监控室的门」。 */
    private String label;

    /** 检查用哪个工具。 */
    private String checkTool;
    /** 检查参数 JSON（时间窗由调度器按 startedAt 填）。 */
    private String checkArgs;
    /** 从检查结果里取哪个字段来判，支持 {@code a.b} 路径。 */
    private String checkField;
    /** 比较符，见 {@link com.example.demo.modules.ai.watch.service.AiWatchService#OPS}。 */
    private String checkOp;
    private String checkValue;
    /** 建计划时那次检查的取值。 */
    private String baselineValue;

    /** 条件成立后执行哪个工具。 */
    private String actTool;
    private String actArgs;

    private Integer intervalSeconds;
    private Integer timeoutSeconds;
    private String status;
    private Integer attempts;
    private LocalDateTime lastCheckedAt;
    private LocalDateTime nextCheckAt;
    private LocalDateTime startedAt;
    private LocalDateTime finishedAt;
    private String resultText;
    private String notifyUserIds;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
