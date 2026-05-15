package com.example.demo.modules.supplies.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface SupplyUserCartMapper {

    String findLinesJsonByUserId(@Param("userId") String userId);

    int upsert(@Param("userId") String userId, @Param("linesJson") String linesJson);
}
