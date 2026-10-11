package com.example.demo.modules.ai.mapper;

import com.example.demo.modules.ai.entity.AiMessageFeedback;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;
import java.util.Map;

/**
 * 回复级反馈（赞/踩）的读写。
 *
 * <p>**写入是 upsert**：表上有 {@code (message_id, user_id)} 唯一键，同一个人对同一条回复
 * 再点一次就是**改那一票**（赞↔踩），不是堆一行 —— 「只算一次」这条由数据库保证，不靠应用层判重。
 */
@Mapper
public interface AiMessageFeedbackMapper {

    @Insert("""
            INSERT INTO ai_message_feedback (message_id, session_id, user_id, vote, reason)
            VALUES (#{messageId}, #{sessionId}, #{userId}, #{vote}, #{reason})
            ON DUPLICATE KEY UPDATE vote = #{vote}, reason = #{reason}
            """)
    int upsert(AiMessageFeedback f);

    /** 某人对某条回复投过什么。没投过返回 null。 */
    @Select("""
            SELECT id, message_id AS messageId, session_id AS sessionId, user_id AS userId,
                   vote, reason, created_at AS createdAt, updated_at AS updatedAt
            FROM ai_message_feedback
            WHERE message_id = #{messageId} AND user_id = #{userId}
            """)
    AiMessageFeedback find(@Param("messageId") Long messageId, @Param("userId") String userId);

    /**
     * **撤掉**这一票（再点一次同一个图标）。
     *
     * <p>不是「改成另一票」——那是 upsert 的事。这里是「我不投了」，所以整行删掉。
     * 按 {@code (message_id, user_id)} 删，只可能命中零行或一行（唯一键）。
     */
    @Delete("""
            DELETE FROM ai_message_feedback
            WHERE message_id = #{messageId} AND user_id = #{userId}
            """)
    int delete(@Param("messageId") Long messageId, @Param("userId") String userId);

    /**
     * 某个会话里**这个人自己**投过的票，供界面回填「我点过哪条」。
     *
     * <p>只回本人的：别人的票对界面没用，发出去还多一层泄露面。
     */
    @Select("""
            SELECT message_id AS messageId, vote, reason
            FROM ai_message_feedback
            WHERE session_id = #{sessionId} AND user_id = #{userId}
            """)
    List<Map<String, Object>> myVotesInSession(@Param("sessionId") Long sessionId,
                                               @Param("userId") String userId);

    /** 某个会话的票数汇总（赞 / 踩各多少）。给判据与后台看。 */
    @Select("""
            SELECT vote, COUNT(*) AS n
            FROM ai_message_feedback
            WHERE session_id = #{sessionId}
            GROUP BY vote
            """)
    List<Map<String, Object>> countsInSession(@Param("sessionId") Long sessionId);

    /**
     * 某个会话里**所有**的票（含别人投的），键是 message_id。
     *
     * <p>与 {@link #myVotesInSession} 的区别：那个只回本人（界面回填用），
     * 这个是**判据**用 —— 判断「这条回复到底好不好」时，谁投的都算数。
     */
    @Select("""
            SELECT message_id AS messageId, vote
            FROM ai_message_feedback
            WHERE session_id = #{sessionId}
            """)
    List<Map<String, Object>> allVotesInSession(@Param("sessionId") Long sessionId);
}
