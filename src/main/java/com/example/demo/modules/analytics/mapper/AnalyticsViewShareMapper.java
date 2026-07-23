package com.example.demo.modules.analytics.mapper;

import com.example.demo.modules.analytics.entity.AnalyticsViewShare;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface AnalyticsViewShareMapper {

    int insert(AnalyticsViewShare row);

    AnalyticsViewShare selectByCodeHash(@Param("shareCodeHash") String shareCodeHash);

    AnalyticsViewShare selectActiveBySourceView(
            @Param("ownerUserId") String ownerUserId, @Param("sourceViewId") long sourceViewId);

    /** source_view_id=0 表示该报表下全部配置的封箱包 */
    AnalyticsViewShare selectActiveByReport(
            @Param("ownerUserId") String ownerUserId, @Param("reportKey") String reportKey);

    int revokeActiveBySourceView(
            @Param("ownerUserId") String ownerUserId, @Param("sourceViewId") long sourceViewId);

    int revokeActiveByReport(@Param("ownerUserId") String ownerUserId, @Param("reportKey") String reportKey);

    int incrementImportCount(@Param("id") long id);

    int revokeByIdAndOwner(@Param("id") long id, @Param("ownerUserId") String ownerUserId);
}
