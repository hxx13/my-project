package com.example.demo.modules.analytics.mapper;

import com.example.demo.modules.analytics.entity.AnalyticsAuditLog;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface AnalyticsAuditLogMapper {

    int insert(AnalyticsAuditLog row);

    List<AnalyticsAuditLog> selectByUserAndReport(
            @Param("userId") String userId,
            @Param("reportKey") String reportKey,
            @Param("viewId") Long viewId,
            @Param("limit") int limit);

    List<AnalyticsAuditLog> selectAllByView(
            @Param("userId") String userId,
            @Param("viewId") long viewId,
            @Param("limit") int limit);

    int countByViewPeriodLabel(
            @Param("viewId") long viewId,
            @Param("periodType") String periodType,
            @Param("periodLabel") String periodLabel);

    AnalyticsAuditLog selectById(@Param("id") long id);

    /** 指定视图下尚无 AI 解读的最近清算记录 */
    List<AnalyticsAuditLog> selectRecentWithoutInsight(
            @Param("userId") String userId,
            @Param("reportKey") String reportKey,
            @Param("viewId") long viewId,
            @Param("limit") int limit);

    /** 全库最近尚无 AI 解读的清算（日批用） */
    List<AnalyticsAuditLog> selectRecentWithoutInsightGlobal(
            @Param("reportKey") String reportKey,
            @Param("limit") int limit);
}
