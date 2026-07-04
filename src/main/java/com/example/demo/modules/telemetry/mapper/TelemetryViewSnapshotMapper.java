package com.example.demo.modules.telemetry.mapper;

import com.example.demo.modules.telemetry.entity.TelemetryViewSnapshotRow;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDateTime;
import java.util.List;

@Mapper
public interface TelemetryViewSnapshotMapper {

    int insert(TelemetryViewSnapshotRow row);

    List<TelemetryViewSnapshotRow> selectPage(
            @Param("from") LocalDateTime from,
            @Param("to") LocalDateTime to,
            @Param("profileCode") String profileCode,
            @Param("offset") int offset,
            @Param("limit") int limit);

    long countPage(
            @Param("from") LocalDateTime from,
            @Param("to") LocalDateTime to,
            @Param("profileCode") String profileCode);

    TelemetryViewSnapshotRow selectById(@Param("id") long id);
}
