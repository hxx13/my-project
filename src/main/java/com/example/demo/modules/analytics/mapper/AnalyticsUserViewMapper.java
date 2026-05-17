package com.example.demo.modules.analytics.mapper;

import com.example.demo.modules.analytics.entity.AnalyticsUserView;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface AnalyticsUserViewMapper {

    List<AnalyticsUserView> selectByUserAndReport(@Param("userId") String userId, @Param("reportKey") String reportKey);

    AnalyticsUserView selectByIdAndUser(@Param("id") long id, @Param("userId") String userId);

    int insert(AnalyticsUserView row);

    int update(AnalyticsUserView row);

    int deleteByIdAndUser(@Param("id") long id, @Param("userId") String userId);

    int clearDefaultForReport(@Param("userId") String userId, @Param("reportKey") String reportKey);

    int setDefault(@Param("id") long id, @Param("userId") String userId);

    List<AnalyticsUserView> selectAllSubscribed(@Param("reportKey") String reportKey);

    int setSubscribed(@Param("id") long id, @Param("userId") String userId, @Param("subscribed") int subscribed);
}
