package com.example.demo.modules.analytics.mapper;

import com.example.demo.modules.analytics.entity.AnalyticsChatSession;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface AnalyticsChatSessionMapper {

    int insert(AnalyticsChatSession row);

    int updateTitle(@Param("id") long id, @Param("userId") String userId, @Param("title") String title);

    int updateContext(@Param("id") long id, @Param("userId") String userId, @Param("contextJson") String contextJson);

    int touchUpdated(@Param("id") long id);

    int deleteByIdAndUser(@Param("id") long id, @Param("userId") String userId);

    AnalyticsChatSession selectByIdAndUser(@Param("id") long id, @Param("userId") String userId);

    List<AnalyticsChatSession> selectByUserReportView(
            @Param("userId") String userId,
            @Param("reportKey") String reportKey,
            @Param("viewId") long viewId,
            @Param("limit") int limit);
}
