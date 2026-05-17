package com.example.demo.modules.aro.mapper;

import com.example.demo.modules.aro.dto.AroRecord;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Map;

@Mapper
public interface AroDatabaseMapper {
    int batchInsertAccessLogs(@Param("records") List<AroRecord> records);

    List<Map<String, Object>> getTodayRecords(@Param("userId") String userId, @Param("todayStart") String todayStart);

    Double getUserTotalExp(@Param("userId") String userId);

    Integer countPersonnel();

    Integer countAccessLogs();

    String getLatestAccessLogCreateTime();

    /** 人员库姓名；无记录或姓名为空时返回 null */
    String findPersonnelNameByUserId(@Param("userId") String userId);

    /**
     * 批量人员姓名；每项含 userId、name（与 {@link #findPersonnelNameByUserId} 同源，多行取 MIN(name)）。
     */
    List<Map<String, Object>> findPersonnelNamesByUserIds(@Param("ids") List<String> ids);

    /** 统计某自然日（yyyy-MM-dd）的流水条数，用于补漏空日 */
    int countAccessLogsOnDay(@Param("day") String day);

    /** 查询已经存在于 aro_access_log 的记录ID */
    List<String> findExistingAccessLogIds(@Param("ids") List<String> ids);

    /** 按 roomId 取最近一条有房间名的流水，用于自动化日志 detail 展开 */
    List<Map<String, Object>> selectLatestRoomNamesByRoomIds(@Param("roomIds") List<String> roomIds);
}
