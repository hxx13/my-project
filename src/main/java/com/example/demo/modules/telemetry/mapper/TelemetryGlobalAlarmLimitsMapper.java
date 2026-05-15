package com.example.demo.modules.telemetry.mapper;

import com.example.demo.modules.telemetry.entity.TelemetryGlobalAlarmLimitsRow;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface TelemetryGlobalAlarmLimitsMapper {

    TelemetryGlobalAlarmLimitsRow selectSingleton();

    int insertSingletonIfMissing();

    int updateSingleton(@Param("tempMin") String tempMin,
                        @Param("tempMax") String tempMax,
                        @Param("humMin") String humMin,
                        @Param("humMax") String humMax,
                        @Param("pressureMin") String pressureMin,
                        @Param("pressureMax") String pressureMax);
}
