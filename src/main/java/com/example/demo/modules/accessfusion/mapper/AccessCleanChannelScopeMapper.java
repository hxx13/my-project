package com.example.demo.modules.accessfusion.mapper;

import com.example.demo.modules.accessfusion.entity.AccessCleanChannelScope;
import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Map;

public interface AccessCleanChannelScopeMapper {
    List<AccessCleanChannelScope> selectByTask(@Param("statsTaskId") long statsTaskId);

    List<String> selectEnabledChannelCodes(@Param("statsTaskId") long statsTaskId);

    int deleteByTask(@Param("statsTaskId") long statsTaskId);

    int insertBatch(@Param("items") List<AccessCleanChannelScope> items);

    List<Map<String, Object>> suggestChannelsFromSwings(@Param("statsTaskId") long statsTaskId, @Param("limit") int limit);

    /** 各任务通道漏斗并集（enabled=1），供清洗页按通道维度选择 */
    List<Map<String, Object>> selectDistinctEnabledChannels();

    List<Long> selectEnabledTaskIdsForChannel(@Param("channelCode") String channelCode);
}
