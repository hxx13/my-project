package com.example.demo.modules.telemetry.mapper;

import com.example.demo.modules.telemetry.entity.TelemetryValueRollupRow;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDateTime;
import java.util.List;

@Mapper
public interface TelemetryValueRollupMapper {

    int upsertBatch(@Param("list") List<TelemetryValueRollupRow> list);

    List<TelemetryValueRollupRow> selectSeriesAsc(
            @Param("variableName") String variableName,
            @Param("from") LocalDateTime from,
            @Param("to") LocalDateTime to,
            @Param("bucketSec") int bucketSec);

    LocalDateTime selectMaxBucketStart(
            @Param("variableName") String variableName,
            @Param("bucketSec") int bucketSec);

    int deleteOlderThan(@Param("cutoff") LocalDateTime cutoff);
}
