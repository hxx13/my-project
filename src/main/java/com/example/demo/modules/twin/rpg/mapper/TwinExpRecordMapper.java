package com.example.demo.modules.twin.rpg.mapper;

import com.example.demo.modules.twin.rpg.entity.TwinExpRecord;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Map;

@Mapper
public interface TwinExpRecordMapper {
    int insert(TwinExpRecord record);

    int countTotalExp();

    int countTodayExp();

    int countActiveUsers();

    int countTodayActiveUsers();

    List<Map<String, Object>> getTopEarners(@Param("limit") int limit);

    List<TwinExpRecord> selectPage(@Param("offset") int offset,
                                   @Param("pageSize") int pageSize,
                                   @Param("userId") String userId,
                                   @Param("sourceType") String sourceType,
                                   @Param("startDate") String startDate,
                                   @Param("endDate") String endDate);

    long countPage(@Param("userId") String userId,
                   @Param("sourceType") String sourceType,
                   @Param("startDate") String startDate,
                   @Param("endDate") String endDate);
}
