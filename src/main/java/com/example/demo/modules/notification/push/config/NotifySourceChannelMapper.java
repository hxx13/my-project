package com.example.demo.modules.notification.push.config;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.util.List;

@Mapper
public interface NotifySourceChannelMapper {
    List<NotifySourceChannel> findBySourceId(@Param("sourceId") Long sourceId);
    NotifySourceChannel findBySourceAndChannel(@Param("sourceId") Long sourceId, @Param("channelCode") String channelCode);
    int insert(NotifySourceChannel config);
    int update(NotifySourceChannel config);
    int updateEnabled(@Param("id") Long id, @Param("enabled") Integer enabled);
}
