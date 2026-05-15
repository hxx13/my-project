package com.example.demo.modules.twin.mapper;

import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;

@Mapper
public interface AroSyncMapper {

    // 1. 检查这条记录是否已经拉取过（防止重复插入，假设 ARO 系统有唯一 log_id）
    @Select("SELECT COUNT(*) FROM aro_access_log WHERE log_id = #{logId}")
    int checkExists(String logId);

    // 2. 将拉取到的新数据插入 SQLite
    @Insert("INSERT INTO aro_access_log (log_id, person_name, area_name, room_name, action, create_time) " +
            "VALUES (#{logId}, #{personName}, #{areaName}, #{roomName}, #{action}, #{createTime})")
    void insertLog(
            String logId,
            String personName,
            String areaName,
            String roomName,
            String action,
            String createTime
    );
}
