package com.example.demo.modules.accessfusion.mapper;

import com.example.demo.modules.accessfusion.entity.AccessCleanExecutionLog;
import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Map;

public interface AccessCleanExecutionLogMapper {
    int insert(AccessCleanExecutionLog row);

    int update(AccessCleanExecutionLog row);

    AccessCleanExecutionLog selectById(@Param("id") long id);

    AccessCleanExecutionLog selectByTaskChannelDay(
            @Param("statsPullTaskId") long statsPullTaskId,
            @Param("channelCode") String channelCode,
            @Param("coverageDay") String coverageDay);

    List<AccessCleanExecutionLog> selectByFilter(
            @Param("statsPullTaskId") Long statsPullTaskId,
            @Param("cleanRuleProfileId") Long cleanRuleProfileId,
            @Param("executionDate") String executionDate,
            @Param("status") String status,
            @Param("limit") int limit,
            @Param("offset") int offset);

    int countByFilter(
            @Param("statsPullTaskId") Long statsPullTaskId,
            @Param("cleanRuleProfileId") Long cleanRuleProfileId,
            @Param("executionDate") String executionDate,
            @Param("status") String status);

    int refreshCountsFromItems(@Param("executionLogId") long executionLogId);

    int deleteById(@Param("id") long id);

    int deleteAll();
}
