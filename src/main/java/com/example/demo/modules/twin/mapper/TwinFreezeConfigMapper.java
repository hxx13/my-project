package com.example.demo.modules.twin.mapper;

import com.example.demo.modules.twin.entity.TwinFreezeConfigRow;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface TwinFreezeConfigMapper {

    Integer countSecondFreezeColumn();

    int addSecondFreezeColumn();

    Integer countSecondFreezeAutoSignoutColumn();

    int addSecondFreezeAutoSignoutColumn();

    TwinFreezeConfigRow selectById(@Param("id") int id);

    int insertIgnoreDefault(@Param("id") int id);

    int updateConfig(
            @Param("id") int id,
            @Param("enabled") int enabled,
            @Param("freezeTime") String freezeTime,
            @Param("secondFreezeTime") String secondFreezeTime,
            @Param("secondFreezeAutoSignoutEnabled") int secondFreezeAutoSignoutEnabled,
            @Param("timezone") String timezone,
            @Param("updatedBy") String updatedBy);

    int updateLastAutoFreezeRunDate(@Param("id") int id, @Param("runDate") String runDate);
}
