package com.example.demo.modules.twin.rpg.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Map;

@Mapper
public interface RpgMapper {
    List<String> getDistinctAccessLogUserIds(@Param("cutoffStart") String cutoffStart);

    List<Map<String, Object>> getUserLogsForRecalc(@Param("userId") String userId,
                                                    @Param("cutoffStart") String cutoffStart);

    int updatePersonnelTotalExp(@Param("userId") String userId, @Param("totalExp") long totalExp);

    /** 原子增量追加经验（用于实时扫码路径，不覆盖历史值） */
    int addPersonnelTotalExp(@Param("userId") String userId, @Param("delta") int delta);

    int recalculateAllExpByEntryCount();

    int countTodayStrandedViolation(@Param("userId") String userId);

    /** 获取指定日期范围内有 aro_access_log 记录的全部 userId */
    List<String> getDistinctUserIdsByDate(@Param("dateStart") String dateStart, @Param("dateEnd") String dateEnd);

    /** 获取单个用户在指定日期的全部 aro_access_log 记录（ASC 排序） */
    List<Map<String, Object>> getUserLogsForDate(@Param("userId") String userId,
                                                  @Param("dateStart") String dateStart,
                                                  @Param("dateEnd") String dateEnd);

    /** 获取 aro_access_log 中所有不重复的日期（yyyy-MM-dd），用于全量历史重算 */
    List<String> getDistinctAccessLogDates(@Param("cutoffStart") String cutoffStart);

    /** 全量重算前重置人员总经验 */
    int resetAllPersonnelTotalExp();

    /** 删除截止日期前的进出流水 */
    int deleteAccessLogsBefore(@Param("cutoffStart") String cutoffStart);
}
