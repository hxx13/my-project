package com.example.demo.modules.telemetry.mapper;

import com.example.demo.modules.telemetry.entity.TelemetryAlarmPreset;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.util.List;

@Mapper
public interface TelemetryAlarmPresetMapper {
    List<TelemetryAlarmPreset> findAll(@Param("floorCode") String floorCode);
    TelemetryAlarmPreset findById(@Param("id") Long id);
    int insert(TelemetryAlarmPreset preset);
    int update(TelemetryAlarmPreset preset);
    int deleteById(@Param("id") Long id);
}
