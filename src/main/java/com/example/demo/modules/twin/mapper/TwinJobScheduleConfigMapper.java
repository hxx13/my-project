package com.example.demo.modules.twin.mapper;

import com.example.demo.modules.twin.entity.TwinJobScheduleConfig;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDateTime;
import java.util.List;

@Mapper
public interface TwinJobScheduleConfigMapper {
    List<TwinJobScheduleConfig> selectAll();
    TwinJobScheduleConfig selectByJobKey(@Param("jobKey") String jobKey);
    int upsertBase(TwinJobScheduleConfig row);
    int updateSchedule(TwinJobScheduleConfig row);
    int markRunning(@Param("jobKey") String jobKey, @Param("runAt") LocalDateTime runAt, @Param("updatedBy") String updatedBy);
    int markSuccess(@Param("jobKey") String jobKey, @Param("runAt") LocalDateTime runAt, @Param("updatedBy") String updatedBy);
    int markFailed(@Param("jobKey") String jobKey, @Param("runAt") LocalDateTime runAt, @Param("error") String error, @Param("updatedBy") String updatedBy);
    int deleteByJobKey(@Param("jobKey") String jobKey);
}
