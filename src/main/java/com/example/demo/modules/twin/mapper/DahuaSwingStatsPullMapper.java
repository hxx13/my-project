package com.example.demo.modules.twin.mapper;

import com.example.demo.modules.twin.entity.DahuaSwingStatsPullTask;
import org.apache.ibatis.annotations.Param;

import java.util.List;

public interface DahuaSwingStatsPullMapper {
    List<DahuaSwingStatsPullTask> listTasks();

    List<DahuaSwingStatsPullTask> listEnabledTasks();

    DahuaSwingStatsPullTask findById(@Param("id") Long id);

    int insert(DahuaSwingStatsPullTask task);

    int update(DahuaSwingStatsPullTask task);

    int delete(@Param("id") Long id);

    int updateRunState(
            @Param("id") Long id,
            @Param("lastPulledStart") String lastPulledStart,
            @Param("lastPulledEnd") String lastPulledEnd,
            @Param("lastStatus") String lastStatus,
            @Param("lastError") String lastError,
            @Param("lastRunAt") String lastRunAt,
            @Param("lastSavedCount") Integer lastSavedCount);

    int updateQueryJson(@Param("id") Long id, @Param("queryJson") String queryJson);

    int updateCleanRuleProfileId(@Param("id") Long id, @Param("cleanRuleProfileId") Long cleanRuleProfileId);
}
