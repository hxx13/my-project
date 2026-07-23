package com.example.demo.modules.accessfusion.mapper;

import com.example.demo.modules.accessfusion.entity.AccessCleanPackageItem;
import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Map;

public interface AccessCleanPackageItemMapper {
    int insertBatch(@Param("items") List<AccessCleanPackageItem> items);

    int deleteByPackageId(@Param("packageId") long packageId);

    int deleteByLastRunId(@Param("lastRunId") long lastRunId);

    int deleteAll();

    int deleteByChannelCodes(@Param("channelCodes") List<String> channelCodes);

    int countAll();

    List<AccessCleanPackageItem> selectByPackage(
            @Param("packageId") long packageId,
            @Param("disposition") String disposition,
            @Param("offset") int offset,
            @Param("limit") int limit);

    int countByPackage(@Param("packageId") long packageId, @Param("disposition") String disposition);

    List<AccessCleanPackageItem> selectByLastRunId(
            @Param("lastRunId") long lastRunId,
            @Param("disposition") String disposition,
            @Param("offset") int offset,
            @Param("limit") int limit);

    int countByLastRunId(@Param("lastRunId") long lastRunId, @Param("disposition") String disposition);

    Map<String, Object> summarizeByLastRunId(@Param("lastRunId") long lastRunId);

    List<AccessCleanPackageItem> selectAllByPackage(@Param("packageId") long packageId);

    int upsertBatch(@Param("items") List<AccessCleanPackageItem> items);

    Map<String, Object> summarizePackage(@Param("packageId") long packageId);

    Map<String, Object> countAudienceSets(
            @Param("startTime") String startTime,
            @Param("endTime") String endTime,
            @Param("channelCodes") List<String> channelCodes,
            @Param("actionType") Integer actionType);

    Map<String, Object> countScopeMetrics(
            @Param("startTime") String startTime,
            @Param("endTime") String endTime,
            @Param("channelCodes") List<String> channelCodes,
            @Param("actionType") Integer actionType);

    List<Map<String, Object>> countEventsByChannel(
            @Param("startTime") String startTime,
            @Param("endTime") String endTime,
            @Param("channelCodes") List<String> channelCodes,
            @Param("actionType") Integer actionType);

    List<Map<String, Object>> listForAggregation(
            @Param("startTime") String startTime,
            @Param("endTime") String endTime,
            @Param("channelCodes") List<String> channelCodes,
            @Param("actionType") Integer actionType);

    Map<String, Object> summarizeGlobalLibrary();

    int countIncludedBetween(
            @Param("channelCode") String channelCode,
            @Param("startTime") String startTime,
            @Param("endTime") String endTime);

    List<AccessCleanPackageItem> listLibraryItems(
            @Param("channelCodes") List<String> channelCodes,
            @Param("startTime") String startTime,
            @Param("endTime") String endTime,
            @Param("disposition") String disposition,
            @Param("audienceType") String audienceType,
            @Param("actionType") Integer actionType,
            @Param("personName") String personName,
            @Param("lastRunId") Long lastRunId,
            @Param("statsPullTaskId") Long statsPullTaskId,
            @Param("offset") int offset,
            @Param("limit") int limit);

    int countLibraryItems(
            @Param("channelCodes") List<String> channelCodes,
            @Param("startTime") String startTime,
            @Param("endTime") String endTime,
            @Param("disposition") String disposition,
            @Param("audienceType") String audienceType,
            @Param("actionType") Integer actionType,
            @Param("personName") String personName,
            @Param("lastRunId") Long lastRunId,
            @Param("statsPullTaskId") Long statsPullTaskId);

    int updateItemFields(
            @Param("id") long id,
            @Param("disposition") String disposition,
            @Param("directionOverride") String directionOverride,
            @Param("manualVerdict") String manualVerdict,
            @Param("audienceType") String audienceType);

    AccessCleanPackageItem selectById(@Param("id") long id);
}
