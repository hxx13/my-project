package com.example.demo.modules.ai.feedback.mapper;

import com.example.demo.modules.ai.feedback.entity.AiDrawerFeedback;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Options;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.time.LocalDateTime;
import java.util.List;

/**
 * AI 抽屉反馈持久化（表 {@code ai_drawer_feedback}）。
 *
 * <p>只做「插一条 / 按人查 / 查全部 / 回复改状态」四件事，判定一律在 {@code AiDrawerFeedbackService}。
 * 列表排序与分页**下沉到 SQL**（{@code created_at DESC, id DESC} + LIMIT/OFFSET），
 * 调用方不再重排，也就不会出现「SQL 与 Java 各排一次、结果不一致」。
 */
@Mapper
public interface AiDrawerFeedbackMapper {

    /** 落一条反馈；{@code created_at/updated_at} 由库默认值填。 */
    @Insert("""
            INSERT INTO ai_drawer_feedback (user_id, user_name, content, image_urls, status)
            VALUES (#{userId}, #{userName}, #{content}, #{imageUrls}, #{status})
            """)
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(AiDrawerFeedback row);

    @Select("""
            SELECT id, user_id AS userId, user_name AS userName, content, image_urls AS imageUrls,
                   status, replies_json AS repliesJson,
                   reply_content AS replyContent, reply_image_urls AS replyImageUrls,
                   replied_by AS repliedBy, replied_at AS repliedAt,
                   created_at AS createdAt, updated_at AS updatedAt
            FROM ai_drawer_feedback
            WHERE id = #{id}
            """)
    AiDrawerFeedback selectById(@Param("id") Long id);

    /** 只看某个人的，按提交时间倒序。 */
    @Select("""
            SELECT id, user_id AS userId, user_name AS userName, content, image_urls AS imageUrls,
                   status, replies_json AS repliesJson,
                   reply_content AS replyContent, reply_image_urls AS replyImageUrls,
                   replied_by AS repliedBy, replied_at AS repliedAt,
                   created_at AS createdAt, updated_at AS updatedAt
            FROM ai_drawer_feedback
            WHERE user_id = #{userId}
            ORDER BY created_at DESC, id DESC
            LIMIT #{limit} OFFSET #{offset}
            """)
    List<AiDrawerFeedback> selectByUser(@Param("userId") String userId,
                                        @Param("offset") int offset,
                                        @Param("limit") int limit);

    @Select("SELECT COUNT(*) FROM ai_drawer_feedback WHERE user_id = #{userId}")
    int countByUser(@Param("userId") String userId);

    /** 全部人的（仅 ≥超管）。 */
    @Select("""
            SELECT id, user_id AS userId, user_name AS userName, content, image_urls AS imageUrls,
                   status, replies_json AS repliesJson,
                   reply_content AS replyContent, reply_image_urls AS replyImageUrls,
                   replied_by AS repliedBy, replied_at AS repliedAt,
                   created_at AS createdAt, updated_at AS updatedAt
            FROM ai_drawer_feedback
            ORDER BY created_at DESC, id DESC
            LIMIT #{limit} OFFSET #{offset}
            """)
    List<AiDrawerFeedback> selectAll(@Param("offset") int offset, @Param("limit") int limit);

    @Select("SELECT COUNT(*) FROM ai_drawer_feedback")
    int countAll();

    /**
     * 整体改写回复位（单行原子更新；返回 0 = 这条已不在，不做部分写）。
     *
     * <p>{@code repliesJson} 是回复串整串（读-改-写算好再传）；旧三列同传，落成「最后一条」做兼容读。
     */
    @Update("""
            UPDATE ai_drawer_feedback
            SET replies_json = #{repliesJson},
                reply_content = #{replyContent},
                reply_image_urls = #{replyImageUrls},
                replied_by = #{repliedBy},
                replied_at = #{repliedAt},
                status = #{status}
            WHERE id = #{id}
            """)
    int reply(@Param("id") Long id,
              @Param("replyContent") String replyContent,
              @Param("replyImageUrls") String replyImageUrls,
              @Param("repliedBy") String repliedBy,
              @Param("repliedAt") LocalDateTime repliedAt,
              @Param("repliesJson") String repliesJson,
              @Param("status") String status);
}
