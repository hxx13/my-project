package com.example.demo.modules.broadcast.mapper;

import com.example.demo.modules.broadcast.entity.BroadcastPlayLog;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface BroadcastPlayLogMapper {

    int insert(BroadcastPlayLog row);

    /** 最近记录；planId 为空表示不限方案。 */
    List<BroadcastPlayLog> selectRecent(@Param("planId") Long planId, @Param("limit") int limit);
}
