package com.example.demo.modules.avidity.mapper;

import com.example.demo.modules.avidity.entity.AvidityAlarmEvent;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;

@Mapper
public interface AvidityAlarmEventMapper {

    /** 开一次报警。同一「变化时刻」＝同一次报警，重复推送靠唯一键挡掉。 */
    int openIfAbsent(AvidityAlarmEvent row);

    /** 还在报的顺手续一下「最后见到」时刻。 */
    int touchOpen(@Param("virtualDeviceId") Long virtualDeviceId,
                  @Param("alarmName") String alarmName,
                  @Param("seenAt") LocalDateTime seenAt);

    /** 恢复：把该点位所有未收口的行补上结束时间。 */
    int closeOpen(@Param("virtualDeviceId") Long virtualDeviceId,
                  @Param("alarmName") String alarmName,
                  @Param("endedAt") LocalDateTime endedAt);

    /** 此刻还在报的（ended_at 为空）—— 「当前报警」用这个。 */
    List<AvidityAlarmEvent> selectOpen(@Param("deviceIds") Collection<Long> deviceIds);

    /** 历史流水，倒序。alarmName 给了就只看那一个点位。 */
    List<AvidityAlarmEvent> selectSince(@Param("since") LocalDateTime since,
                                        @Param("deviceIds") Collection<Long> deviceIds,
                                        @Param("alarmName") String alarmName,
                                        @Param("limit") int limit);

    /** 这个点位从 since 起一共报过几次（推送文案里的「今日第 N 次」）。 */
    int countSince(@Param("virtualDeviceId") Long virtualDeviceId,
                   @Param("alarmName") String alarmName,
                   @Param("since") LocalDateTime since);

    /** 这个点位累计报过几次（推送文案里的「累计第 N 次」）。 */
    int countAll(@Param("virtualDeviceId") Long virtualDeviceId,
                 @Param("alarmName") String alarmName);
}
