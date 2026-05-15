package com.example.demo.modules.twin.mapper;

import com.example.demo.modules.twin.entity.TwinAutomationLog;
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

    long countPage(
            @Param("automationType") String automationType,
            @Param("triggerType") String triggerType,
            @Param("keyword") String keyword,
            @Param("startTime") LocalDateTime startTime,
            @Param("endTime") LocalDateTime endTime,
            @Param("excludePenetrationPoll") Boolean excludePenetrationPoll
    );

    List<TwinAutomationLog> selectNearUserTime(
            @Param("userId") String userId,
            @Param("fromTime") LocalDateTime fromTime,
            @Param("toTime") LocalDateTime toTime,
            @Param("excludePenetrationPoll") Boolean excludePenetrationPoll,
            @Param("limit") int limit
    );
}
