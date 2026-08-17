package com.example.demo.modules.aro.mapper;

import com.example.demo.modules.aro.dto.AroPersonnel;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Result;
import org.apache.ibatis.annotations.Results;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.util.List;

@Mapper
public interface AroPersonnelMapper {
    int upsertPersonnelBatch(@Param("list") List<AroPersonnel> list, @Param("currentTime") String currentTime);

    /** 将 aro_personnel 的资料字段同步到 sys_user（id=user_id 匹配），仅资料字段、不碰账号字段。 */
    @Update("UPDATE sys_user u INNER JOIN aro_personnel a ON u.id = a.user_id " +
            "SET u.name = a.name, u.job_number = a.job_number, u.department_name = a.department_name, " +
            "u.project_group_name = a.project_group_name, u.user_type_names = a.user_type_names, " +
            "u.head = a.head, u.gender = a.gender, u.mobile_phone = a.mobile_phone, u.email = a.email, " +
            "u.is_school = a.is_school, u.display_nickname = a.name")
    int syncProfileToSysUser();

    int updateAllowedRoomsDisplayZh(
            @Param("userId") String userId,
            @Param("text") String text,
            @Param("hasOfficialRoomPermission") int hasOfficialRoomPermission,
            @Param("currentTime") String currentTime);

    @Update("UPDATE aro_personnel SET allowed_rooms_json = #{json}, update_time = #{currentTime} WHERE user_id = #{userId}")
    int updateAllowedRoomsJson(@Param("userId") String userId, @Param("json") String json, @Param("currentTime") String currentTime);

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

    @Select("SELECT * FROM aro_personnel WHERE name = #{name}")
    @Results({
            @Result(property = "id", column = "user_id")
    })
    java.util.List<AroPersonnel> findAllByName(@Param("name") String name);

    @Select("SELECT personal_pin FROM aro_personnel WHERE user_id = #{userId}")
    String findPersonalPinByUserId(@Param("userId") String userId);

    int updatePersonalPin(@Param("userId") String userId,
                          @Param("pinHash") String pinHash,
                          @Param("now") String now);

    int clearPersonalPin(@Param("userId") String userId);

    /** 按课题组名称模糊匹配，返回该组成员的 userId 列表 */
    @Select("SELECT user_id FROM aro_personnel WHERE project_group_name LIKE CONCAT('%', #{projectGroupName}, '%')")
    List<String> selectUserIdsByProjectGroup(@Param("projectGroupName") String projectGroupName);

    @Select("SELECT * FROM aro_personnel WHERE name = #{name} AND job_number = #{jobNumber}")
    @Results({
            @Result(property = "id", column = "user_id")
    })
    AroPersonnel findByNameAndJobNumber(@Param("name") String name, @Param("jobNumber") String jobNumber);

    @Select("SELECT * FROM aro_personnel WHERE name = #{name} AND job_number = #{jobNumber}")
    @Results({
            @Result(property = "id", column = "user_id")
    })
    List<AroPersonnel> findAllByNameAndJobNumber(@Param("name") String name, @Param("jobNumber") String jobNumber);

    @Select("SELECT * FROM aro_personnel WHERE job_number = #{jobNumber}")
    @Results({
            @Result(property = "id", column = "user_id")
    })
    AroPersonnel findByJobNumber(@Param("jobNumber") String jobNumber);

    int updateContactEmail(@Param("userId") String userId, @Param("contactEmail") String contactEmail);
    int updateSendKey(@Param("userId") String userId, @Param("sendKey") String sendKey);
    int updateWxPusherUid(@Param("userId") String userId, @Param("wxPusherUid") String wxPusherUid);

    /** 系统用户无ARO记录时创建占位行，确保contact_email/send_key/wx_pusher_uid可写入 */
    int ensureRowExists(@Param("userId") String userId);
    String findContactEmailByUserId(@Param("userId") String userId);
    String findSendKeyByUserId(@Param("userId") String userId);
    String findWxPusherUidByUserId(@Param("userId") String userId);

    /** 批量查邮箱，返回 userId→email 列表 */
    java.util.List<java.util.Map<String, String>> findContactEmailsByUserIds(@Param("userIds") List<String> userIds);

    /** 批量查SendKey，返回 userId→sendKey 列表 */
    java.util.List<java.util.Map<String, String>> findSendKeysByUserIds(@Param("userIds") List<String> userIds);

    /** 批量查WxPusherUid，返回 userId→wxPusherUid 列表 */
    java.util.List<java.util.Map<String, String>> findWxPusherUidsByUserIds(@Param("userIds") List<String> userIds);

    String findUserIdByContactEmail(@Param("contactEmail") String contactEmail);

    /** 按 openId 查人员库用户 ID（学生 openId 主存储） */
    @Select("SELECT user_id FROM aro_personnel WHERE open_id = #{openId} LIMIT 1")
    String findUserIdByOpenId(@Param("openId") String openId);

    /** 写入 openId */
    int updateOpenId(@Param("userId") String userId, @Param("openId") String openId);

    /** 清除 openId */
    int clearOpenId(@Param("userId") String userId);
}
