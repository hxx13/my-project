package com.example.demo.modules.cageshelf.mapper;

import com.example.demo.modules.cageshelf.entity.CageEventLog;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Map;

@Mapper
public interface CageEventLogMapper {

    void ensureTable();

    int insert(CageEventLog event);

    int batchInsert(@Param("list") List<CageEventLog> events);

    List<CageEventLog> selectByBatchId(@Param("scanBatchId") String scanBatchId,
                                        @Param("eventType") String eventType,
                                        @Param("offset") int offset,
                                        @Param("limit") int limit);

    List<CageEventLog> search(@Param("eventType") String eventType,
                               @Param("campusName") String campusName,
                               @Param("searchText") String searchText,
                               @Param("startTime") String startTime,
                               @Param("endTime") String endTime,
                               @Param("offset") int offset,
                               @Param("limit") int limit);

    int countSearch(@Param("eventType") String eventType,
                     @Param("campusName") String campusName,
                     @Param("searchText") String searchText,
                     @Param("startTime") String startTime,
                     @Param("endTime") String endTime);

    List<Map<String, Object>> timelineByBox(@Param("cageBoxQrCode") String cageBoxQrCode,
                                             @Param("limit") int limit);

    /** 按状态码和延迟天数查询最近的 STATUS_ADDED 事件，用于笼架违规判定 */
    List<CageEventLog> selectRecentStatusAdded(
            @Param("statusCodes") List<String> statusCodes,
            @Param("delayDays") int delayDays,
            @Param("scanBatchId") String scanBatchId);
}
