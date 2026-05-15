package com.example.demo.modules.roommapping.mapper;

import com.example.demo.modules.roommapping.entity.RoomMappingRoom;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface RoomMappingRoomMapper {

    int upsert(RoomMappingRoom row);

    RoomMappingRoom selectByRoomId(@Param("roomId") String roomId);

    long countList(
            @Param("keyword") String keyword,
            @Param("regionName") String regionName,
            @Param("floorName") String floorName,
            @Param("tagFilter") String tagFilter);

    List<RoomMappingRoom> selectPage(
            @Param("keyword") String keyword,
            @Param("regionName") String regionName,
            @Param("floorName") String floorName,
            @Param("tagFilter") String tagFilter,
            @Param("offset") int offset,
            @Param("limit") int limit);

    List<String> selectDistinctRegionNames();

    List<String> selectDistinctFloorNames(@Param("regionName") String regionName);

    /**
     * 将官方返回的 level 与库内已有值取较小者（数字越小权限越高）。
     */
    int mergeOfficialPermissionLevel(@Param("roomId") String roomId, @Param("level") int level);

    /** 库中已同步的等级上界（数字越大越松），无数据时 null */
    Integer selectMaxOfficialPermissionLevelInCatalog();

    /**
     * 比 {@code level} 更严（数值更小）的等级里，最「松」的一档（即小于 level 的最大整数），用于从全库最松档再往严选一档。
     */
    Integer selectMaxStrictLevelStrictlyBelow(@Param("level") int level);

    /**
     * 直接覆盖官方权限等级（与 {@link #mergeOfficialPermissionLevel} 的 LEAST 合并策略不同，供后台手工修正）。
     */
    int updateOfficialPermissionLevel(@Param("roomId") String roomId, @Param("level") Integer level);
}
