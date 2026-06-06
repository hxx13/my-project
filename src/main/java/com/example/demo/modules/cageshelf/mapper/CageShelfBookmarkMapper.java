package com.example.demo.modules.cageshelf.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Map;

@Mapper
public interface CageShelfBookmarkMapper {

    List<Map<String, Object>> selectByUserId(@Param("userId") String userId);

    int insert(@Param("userId") String userId,
               @Param("roomId") Long roomId,
               @Param("shelveId") Long shelveId);

    int delete(@Param("userId") String userId,
               @Param("roomId") Long roomId,
               @Param("shelveId") Long shelveId);

    int countByUserRoomShelve(@Param("userId") String userId,
                              @Param("roomId") Long roomId,
                              @Param("shelveId") Long shelveId);
}
