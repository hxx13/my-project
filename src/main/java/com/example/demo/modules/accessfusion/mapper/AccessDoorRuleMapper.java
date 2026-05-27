package com.example.demo.modules.accessfusion.mapper;

import com.example.demo.modules.accessfusion.entity.AccessDoorRule;
import org.apache.ibatis.annotations.Param;

import java.util.List;

public interface AccessDoorRuleMapper {
    List<AccessDoorRule> selectAllEnabled();

    List<AccessDoorRule> selectEnabledForTask(@Param("statsTaskId") long statsTaskId);

    List<AccessDoorRule> selectPage(
            @Param("keyword") String keyword,
            @Param("statsTaskId") Long statsTaskId,
            @Param("offset") int offset,
            @Param("limit") int limit);

    int countPage(@Param("keyword") String keyword, @Param("statsTaskId") Long statsTaskId);

    AccessDoorRule selectById(@Param("id") long id);

    AccessDoorRule selectByChannel(@Param("channelCode") String channelCode);

    /** 优先匹配具体 stats_task_id，其次 stats_task_id=0 的全局规则 */
    AccessDoorRule selectBestForChannel(
            @Param("channelCode") String channelCode, @Param("taskIds") List<Long> taskIds);

    int insert(AccessDoorRule row);

    int update(AccessDoorRule row);

    int deleteById(@Param("id") long id);
}
