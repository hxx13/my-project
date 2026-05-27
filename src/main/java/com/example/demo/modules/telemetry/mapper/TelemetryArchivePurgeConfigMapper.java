package com.example.demo.modules.telemetry.mapper;

import com.example.demo.modules.telemetry.entity.TelemetryArchivePurgeConfig;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface TelemetryArchivePurgeConfigMapper {

    TelemetryArchivePurgeConfig selectSingleton();

    int upsert(@Param("cfg") TelemetryArchivePurgeConfig cfg);

    int updateLastPurge(
            @Param("deletedRows") long deletedRows,
            @Param("durationMs") int durationMs,
            @Param("updatedBy") String updatedBy);
}
