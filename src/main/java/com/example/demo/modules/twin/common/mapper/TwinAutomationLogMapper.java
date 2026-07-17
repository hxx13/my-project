package com.example.demo.modules.twin.common.mapper;

import com.example.demo.modules.twin.common.entity.TwinAutomationLog;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDateTime;
import java.util.List;

@Mapper
public interface TwinAutomationLogMapper {
    int insert(TwinAutomationLog row);

    List<TwinAutomationLog> selectPage(
            @Param("automationType") String automationType,
            @Param("triggerType") String triggerType,
            @Param("keyword") String keyword,
            @Param("startTime") LocalDateTime startTime,
            @Param("endTime") LocalDateTime endTime,
            @Param("excludePenetrationPoll") Boolean excludePenetrationPoll,
            @Param("offset") int offset,
            @Param("pageSize") int pageSize
    );

    /** 合并分页：从头部取 limit 条 */
    List<TwinAutomationLog> selectPageHead(
            @Param("automationType") String automationType,
            @Param("triggerType") String triggerType,
            @Param("keyword") String keyword,
            @Param("startTime") LocalDateTime startTime,
            @Param("endTime") LocalDateTime endTime,
            @Param("excludePenetrationPoll") Boolean excludePenetrationPoll,
            @Param("limit") int limit
    );

    long countPage(
            @Param("automationType") String automationType,
            @Param("triggerType") String triggerType,
            @Param("keyword") String keyword,
            @Param("startTime") LocalDateTime startTime,
            @Param("endTime") LocalDateTime endTime,
            @Param("excludePenetrationPoll") Boolean excludePenetrationPoll
    );

    /** 豁免轨迹：按 user_id 或 target_id（卡号）反查 EXEMPTION 记账，时间倒序（userId/cardNo 至少一个非空） */
    List<TwinAutomationLog> selectExemptHistory(
            @Param("userId") String userId,
            @Param("cardNo") String cardNo,
            @Param("limit") int limit
    );

    List<TwinAutomationLog> selectNearUserTime(
            @Param("userId") String userId,
            @Param("fromTime") LocalDateTime fromTime,
            @Param("toTime") LocalDateTime toTime,
            @Param("excludePenetrationPoll") Boolean excludePenetrationPoll,
            @Param("limit") int limit
    );
}
