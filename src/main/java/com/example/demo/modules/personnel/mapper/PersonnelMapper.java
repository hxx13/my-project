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

    @Select("SELECT * FROM personnel WHERE aro_user_id = #{aroUserId} LIMIT 1")
    Personnel findByAroUserId(@Param("aroUserId") String aroUserId);

    /** 持有某身份标签（person_identity_tag.code）的全部人员，用于按身份反查人（如课题组管家）。 */
    @Select("SELECT p.* FROM person_identity x "
            + " JOIN personnel p ON p.id = x.user_id "
            + " JOIN person_identity_tag t ON t.id = x.tag_id "
            + " WHERE t.code = #{code} AND t.active = 1")
    List<Personnel> listByTagCode(@Param("code") String code);

    @Select("SELECT * FROM personnel WHERE job_number = #{jobNumber}")
    List<Personnel> findByJobNumber(@Param("jobNumber") String jobNumber);

    /**
     * 按账号 id 批量查人员（staff_id 或 aro_user_id 命中均可），供展示名统一解析。
     */
    @Select({
            "<script>",
            "SELECT id, name, staff_id AS staffId, aro_user_id AS aroUserId,",
            "       project_group_name AS projectGroupName",
            "FROM personnel",
            "WHERE staff_id IN",
            "<foreach collection='ids' item='id' open='(' separator=',' close=')'>#{id}</foreach>",
            "OR aro_user_id IN",
            "<foreach collection='ids' item='id' open='(' separator=',' close=')'>#{id}</foreach>",
            "</script>"
    })
    List<Personnel> findByAccountIds(@Param("ids") List<String> ids);

    @Select("SELECT * FROM personnel WHERE id = #{id} LIMIT 1")
    Personnel findById(@Param("id") Long id);

    /** 某课题组全部成员（project_group_id 命中）。 */
    @Select("SELECT * FROM personnel WHERE project_group_id = #{projectGroupId}")
    List<Personnel> listByProjectGroup(@Param("projectGroupId") Long projectGroupId);

    /** 同名全部行。姓名已不是身份键，调用方必须自行处理「多条 = 歧义」。 */
    @Select("SELECT * FROM personnel WHERE name = #{name}")
    List<Personnel> findByNameAll(@Param("name") String name);

    @Update("UPDATE personnel SET role = #{role} WHERE id = #{id}")
    int updateRole(@Param("id") Long id, @Param("role") String role);

    /** 只写覆盖层单列，避免全列覆盖把同步字段带坏。传 null 即重置为回落 ARO。 */
    @Update("UPDATE personnel SET head_override = #{headOverride} WHERE id = #{id}")
    int updateHeadOverride(@Param("id") Long id, @Param("headOverride") String headOverride);

    /** 同时写归属 id 与文本快照（id 是权威，文本留给 ARO 回灌与兜底展示）。 */
    @Update("UPDATE personnel SET department_id = #{departmentId}, department_name = #{departmentName} WHERE id = #{id}")
    int updateDepartmentRef(@Param("id") Long id, @Param("departmentId") Long departmentId, @Param("departmentName") String departmentName);

    @Update("UPDATE personnel SET project_group_id = #{projectGroupId}, project_group_name = #{projectGroupName} WHERE id = #{id}")
    int updateProjectGroupRef(@Param("id") Long id, @Param("projectGroupId") Long projectGroupId, @Param("projectGroupName") String projectGroupName);

    /** 条件清空归属：仅当该人当前确在此组时才置空，返回影响行数供并发防重复移出。 */
    @Update("UPDATE personnel SET project_group_id = NULL, project_group_name = NULL WHERE id = #{id} AND project_group_id = #{expectedGroupId}")
    int clearProjectGroupRefIfInGroup(@Param("id") Long id, @Param("expectedGroupId") Long expectedGroupId);

    /** 按 ARO 认证 id 取本地头像覆盖层。空/NULL 表示无本地覆盖。 */
    @Select("SELECT head_override FROM personnel WHERE aro_user_id = #{aroUserId} LIMIT 1")
    String findHeadOverrideByAroUserId(@Param("aroUserId") String aroUserId);

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

    /** 挂上教职工账号；工号仅在传入非空时覆盖（ARO 侧同步来的工号是权威值，别用空值抹掉）。 */
    @Update("UPDATE personnel SET staff_id = #{staffId}, "
            + "job_number = COALESCE(NULLIF(#{jobNumber}, ''), job_number) WHERE id = #{id}")
    int linkStaff(@Param("id") Long id, @Param("staffId") String staffId, @Param("jobNumber") String jobNumber);

    @Delete("DELETE FROM personnel")
    int deleteAll();

    @Delete("DELETE FROM personnel WHERE id = #{id}")
    int deleteById(@Param("id") Long id);
}
