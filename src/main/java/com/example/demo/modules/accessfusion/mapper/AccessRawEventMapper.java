package com.example.demo.modules.accessfusion.mapper;

import com.example.demo.modules.accessfusion.entity.AccessRawEvent;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

public interface AccessRawEventMapper {
    int insertIgnore(AccessRawEvent row);

    List<AccessRawEvent> selectForClean(
            @Param("start") LocalDateTime start,
            @Param("end") LocalDateTime end,
            @Param("limit") int limit,
            @Param("offset") int offset);

    int countForClean(@Param("start") LocalDateTime start, @Param("end") LocalDateTime end);

    List<AccessRawEvent> selectSwingPage(
            @Param("start") LocalDateTime start,
            @Param("end") LocalDateTime end,
            @Param("offset") int offset,
            @Param("limit") int limit);

    AccessRawEvent selectById(@Param("id") long id);

    List<AccessRawEvent> listForAudit(
            @Param("taskId") Long taskId,
            @Param("channelCode") String channelCode,
            @Param("personCode") String personCode,
            @Param("personName") String personName,
            @Param("openType") Integer openType,
            @Param("startTime") String startTime,
            @Param("endTime") String endTime,
            @Param("requireMapping") boolean requireMapping,
            @Param("openSuccessOnly") boolean openSuccessOnly,
            @Param("limit") int limit,
            @Param("offset") int offset);

    int countForAudit(
            @Param("taskId") Long taskId,
            @Param("channelCode") String channelCode,
            @Param("personCode") String personCode,
            @Param("personName") String personName,
            @Param("openType") Integer openType,
            @Param("startTime") String startTime,
            @Param("endTime") String endTime,
            @Param("requireMapping") boolean requireMapping,
            @Param("openSuccessOnly") boolean openSuccessOnly);

    Map<String, Object> statsForAudit(
            @Param("taskId") Long taskId,
            @Param("channelCode") String channelCode,
            @Param("personCode") String personCode,
            @Param("personName") String personName,
            @Param("openType") Integer openType,
            @Param("startTime") String startTime,
            @Param("endTime") String endTime,
            @Param("requireMapping") boolean requireMapping,
            @Param("openSuccessOnly") boolean openSuccessOnly);
}
