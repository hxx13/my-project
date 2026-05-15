package com.example.demo.modules.twin.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Map;

@Mapper
public interface RpgMapper {
    List<String> getDistinctAccessLogUserIds();

    List<Map<String, Object>> getUserLogsForRecalc(@Param("userId") String userId);

    int updatePersonnelTotalExp(@Param("userId") String userId, @Param("totalExp") long totalExp);

    int recalculateAllExpByEntryCount();
}
