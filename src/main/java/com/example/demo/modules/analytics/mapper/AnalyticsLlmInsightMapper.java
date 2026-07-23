package com.example.demo.modules.analytics.mapper;

import com.example.demo.modules.analytics.entity.AnalyticsLlmInsight;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface AnalyticsLlmInsightMapper {

    AnalyticsLlmInsight selectByAuditLogId(@Param("auditLogId") long auditLogId);

    List<AnalyticsLlmInsight> selectByViewId(
            @Param("userId") String userId, @Param("viewId") long viewId);

    int insert(AnalyticsLlmInsight row);

    int updateByAuditLogId(AnalyticsLlmInsight row);
}
