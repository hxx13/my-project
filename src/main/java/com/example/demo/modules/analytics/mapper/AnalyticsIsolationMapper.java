package com.example.demo.modules.analytics.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Map;

@Mapper
public interface AnalyticsIsolationMapper {

    List<Map<String, Object>> selectIsolationRooms(
            @Param("campus") String campus,
            @Param("regionName") String regionName,
            @Param("floorName") String floorName);

    List<Map<String, Object>> selectAccessLogsForIsolation(
            @Param("roomIds") List<String> roomIds,
            @Param("roomNames") List<String> roomNames,
            @Param("campus") String campus,
            @Param("keyword") String keyword,
            @Param("startTime") String startTime,
            @Param("endTime") String endTime,
            @Param("excludeBlacklist") Boolean excludeBlacklist);
}
