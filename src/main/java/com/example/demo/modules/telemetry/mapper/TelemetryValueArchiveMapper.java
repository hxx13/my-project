package com.example.demo.modules.telemetry.mapper;

import com.example.demo.modules.telemetry.entity.TelemetryValueArchiveRow;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDateTime;
import java.util.List;

@Mapper
public interface TelemetryValueArchiveMapper {

    int insertBatch(@Param("list") List<TelemetryValueArchiveRow> list);

    int deleteOlderThan(@Param("cutoff") LocalDateTime cutoff);

    long countByFilter(
            @Param("variableQ") String variableQ,
            @Param("from") LocalDateTime from,
            @Param("to") LocalDateTime to);

    List<TelemetryValueArchiveRow> selectPageByFilter(
            @Param("variableQ") String variableQ,
            @Param("from") LocalDateTime from,
            @Param("to") LocalDateTime to,
            @Param("offset") int offset,
            @Param("limit") int limit);

    List<TelemetryValueArchiveRow> selectSeriesAsc(
            @Param("variableName") String variableName,
            @Param("from") LocalDateTime from,
            @Param("to") LocalDateTime to);
}
