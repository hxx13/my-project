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

    /** 系统用户无ARO记录时创建占位行，确保contact_email/send_key可写入 */
    int ensureRowExists(@Param("userId") String userId);
    String findContactEmailByUserId(@Param("userId") String userId);
    String findSendKeyByUserId(@Param("userId") String userId);

    /** 批量查邮箱，返回 userId→email 映射 */
    java.util.Map<String, String> findContactEmailsByUserIds(@Param("userIds") List<String> userIds);

    /** 批量查SendKey，返回 userId→sendKey 映射 */
    java.util.Map<String, String> findSendKeysByUserIds(@Param("userIds") List<String> userIds);

    String findUserIdByContactEmail(@Param("contactEmail") String contactEmail);
}
