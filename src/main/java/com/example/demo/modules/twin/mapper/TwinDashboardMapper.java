package com.example.demo.modules.twin.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Map;

@Mapper
public interface TwinDashboardMapper {
    List<Map<String, String>> getTodayAllRecords();

    List<Map<String, Object>> getPudongRoomRanking();

    List<Map<String, Object>> getPuxiRoomRanking();

    List<Map<String, Object>> getDebugLogs();

    List<Map<String, Object>> getDebugPersonnelList(@Param("limit") int limit, @Param("offset") int offset);

    int getPersonnelTotalCount();

    List<Map<String, Object>> getDebugLogList(@Param("limit") int limit, @Param("offset") int offset);

    int getLogTotalCount();

    List<Map<String, Object>> getRealtimeFeed(@Param("limit") int limit);

    List<Map<String, Object>> searchAccessLogs(@Param("keyword") String keyword, @Param("limit") int limit);

    List<Map<String, Object>> searchPersonnel(@Param("keyword") String keyword, @Param("limit") int limit);

    int addPersonExp(@Param("name") String name, @Param("expToAdd") int expToAdd);

    void updateUserAllowedRoomsJson(@Param("userId") String userId, @Param("roomsJson") String roomsJson);

    Map<String, Object> getPersonnelBasicInfo(@Param("userId") String userId);

    List<Map<String, Object>> getDebugPredictionList(@Param("keyword") String keyword, @Param("limit") int limit, @Param("offset") int offset);

    int getPredictionTotalCount(@Param("keyword") String keyword);

    void saveOrUpdateAnimalOrder(
            @Param("sn") String sn, @Param("areaName") String areaName,
            @Param("projectName") String projectName, @Param("piName") String piName,
            @Param("quantity") int quantity, @Param("maleQuantity") int maleQuantity, @Param("femaleQuantity") int femaleQuantity,
            @Param("orderState") int orderState, @Param("createTime") String createTime, @Param("arrivalDate") String arrivalDate
    );

    List<Map<String, Object>> getMonthlyOrderRanking(@Param("region") String region, @Param("blacklist") java.util.List<String> blacklist);


    void saveOrUpdateOrderDetail(
            @Param("itemId") long itemId, @Param("sn") String sn, @Param("areaName") String areaName, @Param("projectName") String projectName, @Param("piName") String piName, @Param("createTime") String createTime,
            @Param("arrivalDate") String arrivalDate, @Param("supplierName") String supplierName, @Param("strainName") String strainName, @Param("specName") String specName, @Param("maleQty") int maleQty, @Param("femaleQty") int femaleQty,
            @Param("collectorName") String collectorName, @Param("collectorTel") String collectorTel, @Param("orderStateName") String orderStateName, @Param("consumeLocation") String consumeLocation, @Param("memo") String memo
    );

    Map<String, Object> getResearchGroupInfoByRank(@Param("keyword") String keyword, @Param("offset") int offset);

    Map<String, Object> getResearchGroupRow1Summary(@Param("projectName") String projectName, @Param("piName") String piName);

    List<Map<String, Object>> getResearchGroupDetailLog(@Param("projectName") String projectName, @Param("piName") String piName);

    int getGroupedStatsPageTotalCount(@Param("keyword") String keyword);

    List<Map<String, Object>> getActiveRetentionWarnings(@Param("limit") int limit, @Param("areaName") String areaName);

    List<Map<String, Object>> getRoomCardStatusList(@Param("roomId") String roomId);

    void deleteBehaviorPrediction(@Param("userId") String userId);

    void insertBehaviorPrediction(
            @Param("id") String id, @Param("userId") String userId, @Param("userName") String userName,
            @Param("roomId") String roomId, @Param("roomName") String roomName, @Param("dayType") String dayType,
            @Param("medianDurationMins") int medianDurationMins, @Param("peakEntryTime") String peakEntryTime,
            @Param("overtimeProb") double overtimeProb, @Param("entryCurveJson") String entryCurveJson,
            @Param("exitCurveJson") String exitCurveJson, @Param("nextRoomProbJson") String nextRoomProbJson,
            @Param("companionImpactJson") String companionImpactJson, @Param("isColdStart") int isColdStart,
            @Param("updateTime") String updateTime, @Param("weeklyEntryCurveJson") String weeklyEntryCurveJson,
            @Param("weeklyExitCurveJson") String weeklyExitCurveJson
    );

    void deleteGroupRoomPrediction(@Param("groupName") String groupName);

    void insertGroupRoomPrediction(
            @Param("id") String id, @Param("groupName") String groupName, @Param("roomId") String roomId,
            @Param("roomName") String roomName, @Param("peakEntryTime") String peakEntryTime,
            @Param("peakExitTime") String peakExitTime, @Param("heatmapMatrixJson") String heatmapMatrixJson,
            @Param("updateTime") String updateTime
    );

    List<Map<String, Object>> getLatestPredictionsForConsole(@Param("limit") int limit);

    List<String> getDistinctUserIds();

    List<Map<String, Object>> getUserLogsForPrediction(@Param("userId") String userId);

    List<String> getDistinctGroupNames();

    List<Map<String, Object>> getGroupLogsForPrediction(@Param("groupName") String groupName);
    List<Map<String, Object>> getGroupRankingByTimeAndRegion(@Param("startTime") String startTime, @Param("region") String region);

    List<Map<String, Object>> getRoomPieStats(@Param("todayStart") String todayStart, @Param("area") String area);

    Integer getDailyTotalCountByArea(@Param("todayStart") String todayStart, @Param("area") String area);

    List<Map<String, Object>> getTodayEntryLogs(@Param("todayStart") String todayStart);

    List<Map<String, Object>> getFilteredDebugLogs(
            @Param("campus") String campus,
            @Param("floor") String floor,
            @Param("keyword") String keyword,
            @Param("startTime") String startTime,
            @Param("endTime") String endTime,
            @Param("actionType") Integer actionType,
            @Param("roomName") String roomName,
            @Param("excludeBlacklist") Boolean excludeBlacklist,
            @Param("limit") int limit,
            @Param("offset") int offset);

    Map<String, Object> getFilteredDebugStats(
            @Param("campus") String campus,
            @Param("floor") String floor,
            @Param("keyword") String keyword,
            @Param("startTime") String startTime,
            @Param("endTime") String endTime,
            @Param("actionType") Integer actionType,
            @Param("roomName") String roomName,
            @Param("excludeBlacklist") Boolean excludeBlacklist);

    List<Map<String, Object>> getBlacklist();

    int addBlacklist(@Param("userId") String userId, @Param("name") String name, @Param("reason") String reason);

    int removeBlacklist(@Param("userId") String userId);

    List<Map<String, Object>> getTodayActiveUsersForRoomStatus();

    Integer countTodayPuxiVisits(@Param("userId") String userId, @Param("todayPrefix") String todayPrefix);

    /** 今日进入记录中浦东/浦西次数（accessType=1） */
    Map<String, Object> countTodayCampusEntries(@Param("userId") String userId, @Param("todayPrefix") String todayPrefix);

    /**
     * 今日进入（accessType=1）关联房间上的官方 level 聚合：minLvl/maxLvl（数字越小权限越高）。
     * 无记录时返回 null。
     */
    Map<String, Object> selectTodayOfficialLevelVisitAgg(@Param("userId") String userId, @Param("todayPrefix") String todayPrefix);

    int updateAccessLogCardFlags(
            @Param("id") String id,
            @Param("sharedVal") int sharedVal,
            @Param("keepVal") int keepVal,
            @Param("borrowedVal") int borrowedVal
    );

    int updateAccessLogFeedProvenance(
            @Param("id") String id,
            @Param("feedSource") String feedSource,
            @Param("feedSummaryZh") String feedSummaryZh,
            @Param("feedDetailZh") String feedDetailZh,
            @Param("deviceDisplayName") String deviceDisplayName
    );

    /** 仅当 feed_source 仍为空时写入（避免覆盖 Web 扫码异步已写好的溯源） */
    int updateAccessLogFeedProvenanceIfBlank(
            @Param("id") String id,
            @Param("feedSource") String feedSource,
            @Param("feedSummaryZh") String feedSummaryZh,
            @Param("feedDetailZh") String feedDetailZh,
            @Param("deviceDisplayName") String deviceDisplayName
    );

    Map<String, Object> selectAccessLogFeedById(@Param("id") String id);

    List<Map<String, Object>> getPredictionDashboardRecords(
            @Param("userId") String userId,
            @Param("roomId") String roomId,
            @Param("dayType") String dayType
    );

    List<Map<String, Object>> getPredictionRoomsByUser(
            @Param("userId") String userId,
            @Param("dayType") String dayType
    );

    List<Map<String, Object>> getRoomListForPrediction();

    String getGroupRoomNameById(@Param("roomId") String roomId);

    List<Map<String, Object>> getGroupHeatmapByRoomIds(@Param("roomId") String roomId, @Param("suiteId") String suiteId);

    Integer getRoomCapacityByRoomId(@Param("roomId") String roomId);

    int upsertRoomCapacity(@Param("roomId") String roomId, @Param("capacity") Integer capacity);
}

