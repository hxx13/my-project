package com.example.demo.modules.ai.timer.mapper;

import com.example.demo.modules.ai.timer.entity.AiTimer;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 计时器持久化。所有状态迁移都是**带前置条件的 UPDATE**（WHERE 里带旧状态），
 * 靠受影响行数做原子判定 —— 见 {@link #claim}。
 */
@Mapper
public interface AiTimerMapper {

    int insert(AiTimer timer);

    AiTimer selectById(@Param("id") Long id);

    /**
     * 列表。{@code allScope=true} 时忽略 ownerId（≥SUPER_ADMIN 的后门视图）。
     * 在跑的单排前面、按触发时间升序（倒计时最近的先看到）。
     */
    List<AiTimer> selectList(@Param("ownerId") String ownerId,
                             @Param("allScope") boolean allScope,
                             @Param("ownerFilter") String ownerFilter,
                             @Param("status") String status,
                             @Param("limit") int limit);

    int countOpen(@Param("ownerId") String ownerId, @Param("allScope") boolean allScope);

    /** 到期且还没被认领的单。 */
    List<AiTimer> selectDue(@Param("now") LocalDateTime now, @Param("limit") int limit);

    /**
     * 原子认领：只有 {@code PENDING → FIRING} 这一条迁移会成功。
     *
     * <p>返回 1 = 这次是我认领的，可以执行；返回 0 = 别人先认领了（或多个 tick 撞上），**跳过**。
     * 这就是「同一行只执行一次」的全部实现 —— 不需要分布式锁。
     */
    int claim(@Param("id") Long id, @Param("claimedAt") LocalDateTime claimedAt);

    int finishFired(@Param("id") Long id,
                    @Param("firedAt") LocalDateTime firedAt,
                    @Param("resultText") String resultText,
                    @Param("ok") Boolean ok);

    int finishFailed(@Param("id") Long id,
                     @Param("firedAt") LocalDateTime firedAt,
                     @Param("errorMessage") String errorMessage);

    /** 写类工具到点：从 FIRING 落到等确认。 */
    int markAwaitingConfirm(@Param("id") Long id, @Param("claimedAt") LocalDateTime claimedAt);

    /** 人点了确认：从 AWAITING_CONFIRM 认领回 FIRING 再执行（同样靠行数防重复点击）。 */
    int confirmClaim(@Param("id") Long id,
                     @Param("confirmedBy") String confirmedBy,
                     @Param("claimedAt") LocalDateTime claimedAt);

    /** 停一个还在跑的单（PENDING / AWAITING_CONFIRM）。 */
    int cancel(@Param("id") Long id, @Param("cancelledAt") LocalDateTime cancelledAt);

    /** 批量停：{@code ids} 为空表示「全部在跑的」。 */
    int cancelOpen(@Param("ownerId") String ownerId,
                   @Param("allScope") boolean allScope,
                   @Param("ids") List<Long> ids,
                   @Param("cancelledAt") LocalDateTime cancelledAt);

    /** 放弃一个等确认的写类单。 */
    int skipAwaiting(@Param("id") Long id,
                     @Param("cancelledAt") LocalDateTime cancelledAt,
                     @Param("confirmedBy") String confirmedBy);

    /**
     * 收殓僵尸单：认领后进程死了，状态会永远停在 FIRING。
     *
     * <p>收成 FAILED 而不是退回 PENDING —— 退回去等于**重跑一次**，
     * 而它可能是「写操作已经生效但没来得及记结果」，重跑就是二次副作用。
     */
    int recoverStale(@Param("before") LocalDateTime before, @Param("now") LocalDateTime now);
}
