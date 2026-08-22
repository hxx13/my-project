package com.example.demo.modules.nhp.mapper;

import com.example.demo.modules.nhp.entity.CrfNotification;
import org.apache.ibatis.annotations.*;

import java.util.List;

/** NHP 通知消息 mapper。 */
@Mapper
public interface CrfNotificationMapper {

    @Insert("INSERT INTO crf_notification (user_id, type, ref_type, ref_id, title, `read`) " +
            "VALUES (#{userId}, #{type}, #{refType}, #{refId}, #{title}, #{read})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(CrfNotification row);

    @Select("SELECT * FROM crf_notification WHERE id = #{id}")
    CrfNotification findById(Long id);

    @Select("<script>" +
            "SELECT * FROM crf_notification " +
            "<where>" +
            "  <if test='userId != null and userId != \"\"'>" +
            "    (user_id IS NULL OR user_id = #{userId})" +
            "  </if>" +
            "</where>" +
            "ORDER BY id DESC LIMIT #{limit}" +
            "</script>")
    List<CrfNotification> listRecent(@Param("userId") String userId, @Param("limit") int limit);

    @Select("SELECT COUNT(*) FROM crf_notification WHERE `read` = 0 " +
            "AND (user_id IS NULL OR user_id = #{userId})")
    int countUnread(@Param("userId") String userId);

    @Update("UPDATE crf_notification SET `read` = 1 WHERE id = #{id}")
    int markRead(Long id);
}
