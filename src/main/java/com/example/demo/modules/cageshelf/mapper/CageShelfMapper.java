package com.example.demo.modules.cageshelf.mapper;

import com.example.demo.modules.cageshelf.entity.CageShelfIndex;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Map;

@Mapper
public interface CageShelfMapper {
    int countByShelveId(@Param("shelveId") Long shelveId);

    int upsertIndex(CageShelfIndex row);

    int clearAll();

    List<Map<String, Object>> listCampuses();

    List<Map<String, Object>> listAreas(@Param("campusId") Integer campusId);

    List<Map<String, Object>> listFloors(@Param("campusId") Integer campusId,
                                         @Param("areaId") String areaId,
                                         @Param("areaName") String areaName);

    List<Map<String, Object>> listRooms(@Param("campusId") Integer campusId,
                                        @Param("areaId") String areaId,
                                        @Param("areaName") String areaName,
                                        @Param("floorId") String floorId,
                                        @Param("floorName") String floorName);

    List<Map<String, Object>> listShelves(@Param("campusId") Integer campusId,
                                          @Param("areaId") String areaId,
                                          @Param("floorId") String floorId,
                                          @Param("areaName") String areaName,
                                          @Param("floorName") String floorName,
                                          @Param("roomId") String roomId,
                                          @Param("roomName") String roomName);

    CageShelfIndex findByShelveId(@Param("shelveId") String shelveId);

    List<Map<String, Object>> listIndexes(@Param("campusId") Integer campusId,
                                          @Param("areaId") String areaId,
                                          @Param("floorId") String floorId,
                                          @Param("roomId") String roomId,
                                          @Param("limit") int limit,
                                          @Param("offset") int offset);

    int countIndexes(@Param("campusId") Integer campusId,
                     @Param("areaId") String areaId,
                     @Param("floorId") String floorId,
                     @Param("roomId") String roomId);

    /**
     * 笼架占用统计/审计：优先按 campusId—areaId—floorId—roomId（与笼架信息页一致）；
     * 无 ID 时回退旧版 campuses/floors/roomName 名称筛选。
     */
    int countShelveIndexesForAnalytics(
            @Param("campusIds") List<Integer> campusIds,
            @Param("areaIds") List<String> areaIds,
            @Param("floorIds") List<String> floorIds,
            @Param("roomIds") List<String> roomIds,
            @Param("legacyCampusNames") List<String> legacyCampusNames,
            @Param("legacyFloorNames") List<String> legacyFloorNames,
            @Param("legacyRoomName") String legacyRoomName);

    /** @param limit null 或 ≤0 表示不限制条数（全量） */
    List<CageShelfIndex> listShelveIndexesForAnalytics(
            @Param("campusIds") List<Integer> campusIds,
            @Param("areaIds") List<String> areaIds,
            @Param("floorIds") List<String> floorIds,
            @Param("roomIds") List<String> roomIds,
            @Param("legacyCampusNames") List<String> legacyCampusNames,
            @Param("legacyFloorNames") List<String> legacyFloorNames,
            @Param("legacyRoomName") String legacyRoomName,
            @Param("limit") Integer limit);
}
