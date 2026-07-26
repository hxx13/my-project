package com.example.demo.modules.telemetry.mapper;

import com.example.demo.modules.telemetry.entity.TelemetryFloorAlarmConfig;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.util.List;

@Mapper
public interface TelemetryFloorAlarmConfigMapper {
    List<TelemetryFloorAlarmConfig> findAll();
    TelemetryFloorAlarmConfig findByFloorCode(@Param("floorCode") String floorCode);
    int insertOrUpdate(TelemetryFloorAlarmConfig config);
    int updateEnabled(@Param("id") Long id, @Param("enabled") Integer enabled);
}
