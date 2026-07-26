package com.example.demo.modules.telemetry.mapper;

import com.example.demo.modules.telemetry.entity.TelemetrySuiteAlarmConfig;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.util.List;

@Mapper
public interface TelemetrySuiteAlarmConfigMapper {
    List<TelemetrySuiteAlarmConfig> findByFloorCode(@Param("floorCode") String floorCode);
    TelemetrySuiteAlarmConfig findBySuiteNorm(@Param("suiteNorm") String suiteNorm);
    int insertOrUpdate(TelemetrySuiteAlarmConfig config);
    int updateEnabled(@Param("id") Long id, @Param("enabled") Integer enabled);
}
