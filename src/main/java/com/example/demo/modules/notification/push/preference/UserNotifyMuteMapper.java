package com.example.demo.modules.notification.push.preference;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface UserNotifyMuteMapper {
    List<UserNotifyMute> findByUserId(@Param("userId") String userId);
    UserNotifyMute findByUserAndSource(@Param("userId") String userId, @Param("sourceCode") String sourceCode);
    int insertOrUpdate(UserNotifyMute mute);
}
