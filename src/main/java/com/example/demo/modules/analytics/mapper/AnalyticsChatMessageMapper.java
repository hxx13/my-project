package com.example.demo.modules.analytics.mapper;

import com.example.demo.modules.analytics.entity.AnalyticsChatMessage;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface AnalyticsChatMessageMapper {

    int insert(AnalyticsChatMessage row);

    List<AnalyticsChatMessage> selectBySession(@Param("sessionId") long sessionId, @Param("limit") int limit);

    int countBySession(@Param("sessionId") long sessionId);
}
