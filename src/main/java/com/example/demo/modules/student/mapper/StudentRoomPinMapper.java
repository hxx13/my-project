package com.example.demo.modules.student.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface StudentRoomPinMapper {
    List<String> selectPinnedRoomIds(@Param("userId") String userId);

    int insert(@Param("userId") String userId, @Param("roomId") String roomId);

    int delete(@Param("userId") String userId, @Param("roomId") String roomId);

    int exists(@Param("userId") String userId, @Param("roomId") String roomId);
}
