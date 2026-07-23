package com.example.demo.modules.analytics.mapper;

import com.example.demo.modules.analytics.entity.AnalyticsQuerySnapshot;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface AnalyticsQuerySnapshotMapper {

    AnalyticsQuerySnapshot selectByViewPeriod(
            @Param("userId") String userId,
            @Param("viewId") long viewId,
            @Param("reportKey") String reportKey,
            @Param("periodKey") String periodKey);

    int insert(AnalyticsQuerySnapshot row);

    int deleteByViewPeriod(
            @Param("userId") String userId,
            @Param("viewId") long viewId,
            @Param("reportKey") String reportKey,
            @Param("periodKey") String periodKey);
}
