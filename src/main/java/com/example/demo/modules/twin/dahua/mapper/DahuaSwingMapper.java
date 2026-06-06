package com.example.demo.modules.twin.dahua.mapper;

import com.example.demo.modules.twin.dahua.entity.DahuaActivationState;
import com.example.demo.modules.twin.dahua.entity.DahuaSwingPullTask;
import com.example.demo.modules.accessfusion.model.AccessAuditFilterParams;
import com.example.demo.modules.twin.dahua.entity.DahuaSwingRecord;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface DahuaSwingMapper {
    List<DahuaSwingPullTask> listTasks();

    List<DahuaSwingPullTask> listEnabledTasks();

    DahuaSwingPullTask findTaskById(@Param("id") Long id);

    int insertTask(DahuaSwingPullTask task);

    int updateTask(DahuaSwingPullTask task);

    int updateTaskRunState(
            @Param("id") Long id,
            @Param("lastCursorTime") String lastCursorTime,
            @Param("lastStatus") String lastStatus,
            @Param("lastError") String lastError,
            @Param("lastRunAt") String lastRunAt
    );

    int deleteTask(@Param("id") Long id);

    int upsertRecord(DahuaSwingRecord record);

    /**
     * 拉取轮询 upsert 前查询：若该条已存在且 mapping_hit=1，则不应再次触发门禁联动（避免每轮 poll 重复执行激活/签退）。
     */
    DahuaSwingRecord findRecordByTaskIdAndRecordId(
            @Param("taskId") Long taskId,
            @Param("recordId") String recordId
    );

    /** 是否已有联动行引用该刷卡记录（防重复入队） */
    int countActivationByUserAndLastRecordId(
            @Param("taskId") Long taskId,
            @Param("userId") String userId,
            @Param("recordId") String recordId
    );

    List<DahuaSwingRecord> listRecords(
            @Param("taskId") Long taskId,
            @Param("channelCode") String channelCode,
            @Param("channelCodes") List<String> channelCodes,
            @Param("personCode") String personCode,
            @Param("personName") String personName,
            @Param("openType") Integer openType,
            @Param("enterOrExit") Integer enterOrExit,
            @Param("startTime") String startTime,
            @Param("endTime") String endTime,
            @Param("limit") int limit,
            @Param("offset") int offset
    );

    /** 多任务下同通道刷卡（清洗包按 channel_code 聚合） */
    List<DahuaSwingRecord> listRecordsForChannelTasks(
            @Param("taskIds") List<Long> taskIds,
            @Param("channelCode") String channelCode,
            @Param("startTime") String startTime,
            @Param("endTime") String endTime,
            @Param("afterSwingTime") String afterSwingTime,
            @Param("enterOrExit") Integer enterOrExit,
            @Param("pullTaskType") String pullTaskType,
            @Param("sortAsc") boolean sortAsc,
            @Param("limit") int limit,
            @Param("offset") int offset
    );

    int countRecordsForChannelTasks(
            @Param("taskIds") List<Long> taskIds,
            @Param("channelCode") String channelCode,
            @Param("startTime") String startTime,
            @Param("endTime") String endTime,
            @Param("afterSwingTime") String afterSwingTime,
            @Param("enterOrExit") Integer enterOrExit,
            @Param("pullTaskType") String pullTaskType);

    int countRecords(
            @Param("taskId") Long taskId,
            @Param("channelCode") String channelCode,
            @Param("personCode") String personCode,
            @Param("personName") String personName,
            @Param("openType") Integer openType,
            @Param("enterOrExit") Integer enterOrExit,
            @Param("startTime") String startTime,
            @Param("endTime") String endTime
    );

    List<DahuaSwingRecord> listRecordsByFilter(
            @Param("f") AccessAuditFilterParams filter, @Param("limit") int limit, @Param("offset") int offset);

    int countRecordsByFilter(@Param("f") AccessAuditFilterParams filter);

    /** 审计任务在记录库中的 STATS 刷卡条数（与记录库筛选 taskId 一致） */
    int countStatsRecordsByTaskId(@Param("taskId") long taskId);

    int countRecordsMissingEnterExit(
            @Param("taskId") Long taskId,
            @Param("channelCode") String channelCode,
            @Param("personCode") String personCode,
            @Param("personName") String personName,
            @Param("openType") Integer openType,
            @Param("startTime") String startTime,
            @Param("endTime") String endTime
    );

    List<DahuaSwingRecord> listRecordsForRawBackfill(
            @Param("startTime") String startTime,
            @Param("endTime") String endTime,
            @Param("limit") int limit,
            @Param("offset") int offset);

    DahuaActivationState findActivationState(
            @Param("taskId") Long taskId,
            @Param("userId") String userId,
            @Param("channelCode") String channelCode
    );

    int upsertActivationState(DahuaActivationState state);

    List<DahuaActivationState> listDueActivationStates(@Param("nowTime") String nowTime);

    int deleteActivationState(@Param("id") Long id);

    int deleteActivationStatesByUserId(@Param("userId") String userId);

    int deleteActivationStateByUserTaskAndChannel(
            @Param("taskId") Long taskId,
            @Param("userId") String userId,
            @Param("channelCode") String channelCode
    );

    int countActivatedStatesForUser(
            @Param("taskId") Long taskId,
            @Param("userId") String userId
    );

    int countAutoExitScheduledForUser(
            @Param("taskId") Long taskId,
            @Param("userId") String userId
    );

    int existsPendingActivationForUser(
            @Param("taskId") Long taskId,
            @Param("userId") String userId,
            @Param("pendingChannel") String pendingChannel
    );

    /** 获取 MySQL 命名锁（跨实例互斥），timeoutSeconds=0 表示不等待，拿不到立即返回 */
    int tryAcquireLock(@Param("lockName") String lockName, @Param("timeoutSeconds") int timeoutSeconds);

    /** 释放 MySQL 命名锁 */
    int releaseLock(@Param("lockName") String lockName);

    /** 列出所有当前处于 ACTIVATED 状态的用户（滞留检测用） */
    List<Map<String, Object>> listActivatedUsers();
}
