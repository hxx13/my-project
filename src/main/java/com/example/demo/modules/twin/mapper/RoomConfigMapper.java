package com.example.demo.modules.twin.mapper;

import com.example.demo.modules.twin.entity.RoomConfig;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.util.List;

@Mapper
public interface RoomConfigMapper {

    List<RoomConfig> selectAllActive();

    int insert(RoomConfig entity);

    // 🚨 架构纠偏：对于 ACL 字典表，放弃软删除，采用物理抹除，释放 Unique 锁
    int deleteLogic(@Param("id") Long id);

    // 🚨 精准打击：只更新容量，防止覆盖其他字段
    int updateCapacity(@Param("id") Long id, @Param("capacity") Integer capacity);

    int updateCapacityBindRoomId(@Param("id") Long id, @Param("capacityBindRoomId") String capacityBindRoomId);
}