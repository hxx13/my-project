package com.example.demo.modules.avidity.mapper;

import com.example.demo.modules.avidity.entity.AvidityAlarmStat;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDate;
import java.util.Collection;
import java.util.List;

@Mapper
public interface AvidityAlarmStatMapper {

    /** 同一统计窗口反复拉会得到同一批数，按唯一键覆盖写，不堆行。 */
    int upsert(AvidityAlarmStat row);

    /** deviceIds 为空表示不限设备（该日全部）。 */
    List<AvidityAlarmStat> selectByDate(@Param("statDate") LocalDate statDate,
                                        @Param("deviceIds") Collection<Long> deviceIds);
}
