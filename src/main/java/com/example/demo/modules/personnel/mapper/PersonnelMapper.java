package com.example.demo.modules.personnel.mapper;

import com.example.demo.modules.personnel.dto.PersonnelFilter;
import com.example.demo.modules.personnel.entity.Personnel;
import org.apache.ibatis.annotations.*;

import java.util.List;

@Mapper
public interface PersonnelMapper {

    @SelectProvider(type = PersonnelSqlProvider.class, method = "search")
    List<Personnel> search(PersonnelFilter filter);

    @SelectProvider(type = PersonnelSqlProvider.class, method = "count")
    int count(PersonnelFilter filter);

    @Select("SELECT * FROM personnel WHERE staff_id = #{staffId} LIMIT 1")
    Personnel findByStaffId(@Param("staffId") String staffId);

    @Select("SELECT * FROM personnel WHERE name = #{name} LIMIT 1")
    Personnel findByName(@Param("name") String name);

    @Insert("INSERT INTO personnel(name, staff_id, aro_user_id, job_number, department_name, project_group_name, institution_id, " +
            "user_type_names, head, gender, mobile_phone, email, is_school, allowed_rooms_display_zh, has_official_room_permission) " +
            "VALUES(#{name}, #{staffId}, #{aroUserId}, #{jobNumber}, #{departmentName}, #{projectGroupName}, #{institutionId}, " +
            "#{userTypeNames}, #{head}, #{gender}, #{mobilePhone}, #{email}, #{isSchool}, #{allowedRoomsDisplayZh}, #{hasOfficialRoomPermission})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(Personnel p);

    @Update("UPDATE personnel SET name=#{name}, staff_id=#{staffId}, aro_user_id=#{aroUserId}, job_number=#{jobNumber}, " +
            "department_name=#{departmentName}, project_group_name=#{projectGroupName}, " +
            "institution_id=#{institutionId}, user_type_names=#{userTypeNames}, head=#{head}, gender=#{gender}, " +
            "mobile_phone=#{mobilePhone}, email=#{email}, is_school=#{isSchool}, " +
            "allowed_rooms_display_zh=#{allowedRoomsDisplayZh}, has_official_room_permission=#{hasOfficialRoomPermission} WHERE id=#{id}")
    int update(Personnel p);

    @Update("UPDATE personnel SET staff_id=#{staffId} WHERE id=#{id}")
    int linkStaff(@Param("id") Long id, @Param("staffId") String staffId);

    @Delete("DELETE FROM personnel")
    int deleteAll();
}
