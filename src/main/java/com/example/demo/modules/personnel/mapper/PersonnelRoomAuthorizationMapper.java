package com.example.demo.modules.personnel.mapper;

import com.example.demo.modules.personnel.entity.PersonnelRoomAuthorization;
import org.apache.ibatis.annotations.*;

import java.util.List;

@Mapper
public interface PersonnelRoomAuthorizationMapper {

    @Select("SELECT aro_user_id, room_id, updated_at, updated_by FROM personnel_room_authorization WHERE aro_user_id = #{userId}")
    List<PersonnelRoomAuthorization> selectByUser(@Param("userId") String userId);

    @Insert("INSERT INTO personnel_room_authorization (aro_user_id, room_id, updated_at, updated_by) VALUES (#{aroUserId}, #{roomId}, #{updatedAt}, #{updatedBy})")
    int insert(PersonnelRoomAuthorization row);

    @Delete("DELETE FROM personnel_room_authorization WHERE aro_user_id = #{userId}")
    int deleteByUser(@Param("userId") String userId);
}
