package com.example.demo.modules.twin.mapper;

import com.example.demo.modules.twin.entity.DahuaActivationState;
import com.example.demo.modules.twin.entity.DahuaSwingPullTask;
import com.example.demo.modules.twin.entity.DahuaSwingRecord;
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
            @Param("personCode") String personCode,
            @Param("personName") String personName,
            @Param("openType") Integer openType,
            @Param("startTime") String startTime,
            @Param("endTime") String endTime,
            @Param("limit") int limit,
            @Param("offset") int offset
    );

    int countRecords(
            @Param("taskId") Long taskId,
            @Param("channelCode") String channelCode,
            @Param("personCode") String personCode,
            @Param("personName") String personName,
            @Param("openType") Integer openType,
            @Param("startTime") String startTime,
            @Param("endTime") String endTime
    );

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
}
