package com.example.demo.modules.aro.mapper;

import com.example.demo.modules.aro.dto.AroPersonnel;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Result;
import org.apache.ibatis.annotations.Results;
import org.apache.ibatis.annotations.Select;

import java.util.List;

@Mapper
public interface AroPersonnelMapper {
    int upsertPersonnelBatch(@Param("list") List<AroPersonnel> list, @Param("currentTime") String currentTime);

    int updateAllowedRoomsDisplayZh(
            @Param("userId") String userId,
            @Param("text") String text,
            @Param("hasOfficialRoomPermission") int hasOfficialRoomPermission,
            @Param("currentTime") String currentTime);

    @Select("SELECT * FROM aro_personnel WHERE user_id = #{userId}")
    @Results({
            @Result(property = "id", column = "user_id")
    })
    AroPersonnel findByUserId(@Param("userId") String userId);

    @Select("SELECT * FROM aro_personnel WHERE name = #{name}")
    @Results({
            @Result(property = "id", column = "user_id")
    })
    AroPersonnel findByName(@Param("name") String name);
}
