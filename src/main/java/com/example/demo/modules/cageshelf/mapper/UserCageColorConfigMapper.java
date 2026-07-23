package com.example.demo.modules.cageshelf.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Map;

@Mapper
public interface UserCageColorConfigMapper {

    void ensureTable();

    List<Map<String, Object>> selectByUserId(@Param("userId") String userId);

    int upsert(@Param("userId") String userId,
               @Param("statusCode") String statusCode,
               @Param("bgColor") String bgColor,
               @Param("borderColor") String borderColor);

    int deleteByUserId(@Param("userId") String userId);

    int batchUpsert(@Param("userId") String userId, @Param("list") List<Map<String, Object>> rows);
}
