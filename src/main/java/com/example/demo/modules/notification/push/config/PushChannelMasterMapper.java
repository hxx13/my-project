package com.example.demo.modules.notification.push.config;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.util.List;
import java.util.Map;

@Mapper
public interface PushChannelMasterMapper {
    @Select("SELECT channel_code, enabled FROM push_channel_master")
    List<Map<String, Object>> findAll();

    @Select("SELECT enabled FROM push_channel_master WHERE channel_code = #{channelCode}")
    Integer findEnabledByCode(@Param("channelCode") String channelCode);

    @Update("INSERT INTO push_channel_master (channel_code, enabled) VALUES (#{channelCode}, #{enabled}) ON DUPLICATE KEY UPDATE enabled = VALUES(enabled)")
    int upsert(@Param("channelCode") String channelCode, @Param("enabled") int enabled);
}
