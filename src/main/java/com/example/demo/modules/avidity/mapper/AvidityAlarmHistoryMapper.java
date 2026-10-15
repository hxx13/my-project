package com.example.demo.modules.avidity.mapper;

import com.example.demo.modules.avidity.entity.AvidityAlarmHistory;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface AvidityAlarmHistoryMapper {

    /** 按 alarm_id 幂等写入。 */
    int upsert(AvidityAlarmHistory row);

    /** 某个点位的历史，倒序。 */
    List<AvidityAlarmHistory> selectByAlarmName(@Param("alarmName") String alarmName,
                                                @Param("limit") int limit);

    /** 某点位按天聚合（最近 N 天），给「历史」弹窗里的柱状用。 */
    List<java.util.Map<String, Object>> countByDay(@Param("alarmName") String alarmName,
                                                   @Param("days") int days);

    /** 全部点位的历史，倒序。deviceIds 为空 = 不限通道。 */
    List<AvidityAlarmHistory> selectRecent(@Param("deviceIds") java.util.Collection<Long> deviceIds,
                                           @Param("limit") int limit);

    /** 全部点位按天聚合（最近 N 天）。 */
    List<java.util.Map<String, Object>> countByDayAll(@Param("deviceIds") java.util.Collection<Long> deviceIds,
                                                      @Param("days") int days);

    int countAll();
}
