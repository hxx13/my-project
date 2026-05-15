package com.example.demo.modules.roommapping.mapper;

import com.example.demo.modules.roommapping.entity.RoomMappingChannel;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface RoomMappingChannelMapper {

    int deleteByRoomId(@Param("roomId") String roomId);

    int insertBatch(@Param("rows") List<RoomMappingChannel> rows);

    List<RoomMappingChannel> selectByRoomId(@Param("roomId") String roomId);

    List<RoomMappingChannel> selectByRoomIds(@Param("roomIds") List<String> roomIds);
}
