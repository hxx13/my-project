package com.example.demo.modules.supplies.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDateTime;

@Mapper
public interface SupplyUserViewStateMapper {
    LocalDateTime findLastViewedAt(@Param("userId") String userId);

    int upsertLastViewedAt(@Param("userId") String userId, @Param("lastViewedAt") LocalDateTime lastViewedAt);
}
