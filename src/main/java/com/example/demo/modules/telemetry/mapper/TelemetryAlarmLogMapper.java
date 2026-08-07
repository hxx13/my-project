package com.example.demo.modules.telemetry.mapper;

import com.example.demo.modules.telemetry.entity.TelemetryAlarmLog;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.time.LocalDateTime;

@Mapper
public interface TelemetryAlarmLogMapper {
    int insert(TelemetryAlarmLog log);
    /** 查询指定变量最近一次同方向报警的发送时间，用于冷却窗口判断 */
    TelemetryAlarmLog findLastByVariableAndBand(
            @Param("variableName") String variableName,
            @Param("alarmBand") String alarmBand);
    /** 查询指定变量上一次的 alarmBand（无论方向），用于状态变化检测 */
    TelemetryAlarmLog findLastByVariable(@Param("variableName") String variableName);
    /** 查询指定变量最近一次非OK报警记录，用于每变量重报警冷却 */
    TelemetryAlarmLog findLastAlarmByVariable(@Param("variableName") String variableName);
    int deleteOlderThan(@Param("before") LocalDateTime before);
}
