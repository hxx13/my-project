package com.example.demo.modules.ai.mapper;

import com.example.demo.modules.ai.entity.AiUserPreference;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

/**
 * 用户偏好的读写。**每一句都带 user_id** —— 这个表里没有「全站」这个概念，
 * 漏了它就是把别人的偏好读出来或写到别人名下。
 */
@Mapper
public interface AiUserPreferenceMapper {

    /** 记一条。同一个人记同样的内容不会堆行（唯一键），重复写只是刷新时间。 */
    @Insert("""
            INSERT INTO ai_user_preference (user_id, content, source)
            VALUES (#{userId}, #{content}, #{source})
            ON DUPLICATE KEY UPDATE updated_at = NOW(), source = #{source}
            """)
    int remember(AiUserPreference p);

    /** 忘掉一条。返回 0 = 本来就没这条（模型不该说「忘了」，要说「本来就没记过」）。 */
    @Delete("DELETE FROM ai_user_preference WHERE user_id = #{userId} AND content = #{content}")
    int forget(@Param("userId") String userId, @Param("content") String content);

    /**
     * 本人的全部偏好，**最近写的在前**。
     *
     * <p>顺序就是「超长时先丢谁」的顺序（设计 §8.5 按最近使用淘汰），所以不能在 SQL 里随便排。
     */
    @Select("""
            SELECT id, user_id AS userId, content, source,
                   created_at AS createdAt, updated_at AS updatedAt
            FROM ai_user_preference
            WHERE user_id = #{userId}
            ORDER BY updated_at DESC, id DESC
            LIMIT #{limit}
            """)
    List<AiUserPreference> listByUser(@Param("userId") String userId, @Param("limit") int limit);

    /** 清空（超管的「重置」用，设计 §8.7）。 */
    @Delete("DELETE FROM ai_user_preference WHERE user_id = #{userId}")
    int clear(@Param("userId") String userId);
}
