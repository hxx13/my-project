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

    int revokeActiveBySourceView(
            @Param("ownerUserId") String ownerUserId, @Param("sourceViewId") long sourceViewId);

    int incrementImportCount(@Param("id") long id);

    int revokeByIdAndOwner(@Param("id") long id, @Param("ownerUserId") String ownerUserId);
}
