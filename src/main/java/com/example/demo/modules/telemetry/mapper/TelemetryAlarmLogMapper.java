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
    /**
     * 本轮同方向连续报警的起点时间：最后一条 OK 台账之后、该方向最早的一条。
     * 用于重提醒文案里的"已持续 X 小时"。没有 OK 行时从最早一条算起。
     */
    LocalDateTime findStreakStart(@Param("variableName") String variableName,
                                 @Param("alarmBand") String alarmBand);
    int deleteOlderThan(@Param("before") LocalDateTime before);
}
