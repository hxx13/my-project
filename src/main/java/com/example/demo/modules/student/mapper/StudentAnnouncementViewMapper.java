package com.example.demo.modules.student.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDateTime;

@Mapper
public interface StudentAnnouncementViewMapper {

    /** 读游标；该用户从未查看过返回 null */
    LocalDateTime selectLastViewedAt(@Param("userId") String userId);

    /** upsert：无则插入，有则把游标推进到当前时间 */
    int upsertLastViewedAt(@Param("userId") String userId);
}
