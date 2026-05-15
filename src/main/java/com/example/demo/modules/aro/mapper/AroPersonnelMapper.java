package com.example.demo.modules.aro.mapper;

import com.example.demo.modules.aro.dto.AroPersonnel;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface AroPersonnelMapper {
    int upsertPersonnelBatch(@Param("list") List<AroPersonnel> list, @Param("currentTime") String currentTime);

    int updateAllowedRoomsDisplayZh(
            @Param("userId") String userId,
            @Param("text") String text,
            @Param("hasOfficialRoomPermission") int hasOfficialRoomPermission,
            @Param("currentTime") String currentTime);
}
