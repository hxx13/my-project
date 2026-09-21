package com.example.demo.modules.cageshelf.mapper;

import com.example.demo.modules.cageshelf.entity.CageStatusAlert;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 告警实例表（cage_status_alert）的读写。
 * 只服务于 T4 告警引擎（CageStatusAlertScheduler）与后续读取端点；与老的快照告警链路零耦合。
 */
public interface CageStatusAlertMapper {

    /** 新建一条（CREATE_ACTIVE 写 state=ACTIVE / CREATE_PENDING 写 state=PENDING，同一套列）。 */
    int insert(CageStatusAlert row);

    /** PENDING 升级为 ACTIVE，并快照当下阈值与动作。带 state='PENDING' 守卫防并发双升。 */
    int promoteToActive(@Param("id") long id,
                        @Param("firedAt") LocalDateTime firedAt,
                        @Param("thresholdDays") int thresholdDays,
                        @Param("action") String action);

    /** 置 CLEARED：解除时刻 + 清 active_key 释放唯一索引占位。带 state != 'CLEARED' 守卫幂等。 */
    int clear(@Param("id") long id, @Param("clearedAt") LocalDateTime clearedAt);

    /**
     * 回填违规父记录 id。带 {@code violation_id IS NULL} 守卫：并发下只有一个发布者认领成功，
     * 败者据此撤掉自己刚建的父记录，杜绝同一告警建出两条违规（引擎持 GET_LOCK 已串行，这是双保险）。
     *
     * @return 1=认领成功；0=他人已回填
     */
    int claimViolationId(@Param("id") long id, @Param("violationId") long violationId);

    /** 全部非 CLEARED 行（PENDING + ACTIVE），引擎据此做幂等判定。 */
    List<CageStatusAlert> listNonCleared();

    /**
     * 按 id 取一行。**给通知用**：通知要精确的「起算时刻 / 触发时刻 / 阈值天数」，
     * 而升级（PROMOTE）那条意图里没有起算时刻，只能回表读（行在 CREATE_PENDING 时就已落库）。
     */
    CageStatusAlert selectById(@Param("id") long id);

    /** 全部 ACTIVE 行；cageIds 非空时只取这些笼位（命中 idx_csa_state_fired）。读取端点用。 */
    List<CageStatusAlert> listActive(@Param("cageIds") List<Long> cageIds);

    /**
     * 同一段超时（同笼位 + 同状态 + 同起算时刻）是否已经挂过违规。
     *
     * <p>引擎「撤销 → 重建」同一段区间时，重建的行是**新 id**，{@link #claimViolationId} 那种按行 id 的
     * 守卫拦不住重复发违规；按 started_at 判定才对 —— 起算点相同才算同一段超时，
     * 「标记 → 取消 → 再标记」是新区间、该再发一次。
     */
    int countPriorViolationForInterval(@Param("alertId") long alertId);

    /*
      具名锁（GET_LOCK/RELEASE_LOCK）不放这里：MySQL 具名锁是**连接级**的，
      拆成两次 mapper 调用会借到不同连接 → 放锁放空、锁永久泄漏（2026-09-18 踩过，引擎停摆）。
      现在由 CageStatusAlertScheduler.scan() 用一条 JdbcTemplate 连接自己取放。
    */
}
