package com.example.demo.modules.ai.watch.mapper;

import com.example.demo.modules.ai.watch.entity.AiWatch;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;
import org.apache.ibatis.annotations.Options;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 条件触发器的读写。
 *
 * <p>每次扫描都按 {@code status + next_check_at} 走索引取，不做全表扫 ——
 * 这条查询每十几秒就跑一次，是全表扫的话会一直占着库。
 */
@Mapper
public interface AiWatchMapper {

    @Insert("""
            INSERT INTO ai_watch (owner_user_id, owner_name_snapshot, session_id, message_id, label,
                                  check_tool, check_args, check_field, check_op, check_value, baseline_value,
                                  act_tool, act_args, interval_seconds, timeout_seconds, status,
                                  attempts, next_check_at, started_at, notify_user_ids)
            VALUES (#{ownerUserId}, #{ownerNameSnapshot}, #{sessionId}, #{messageId}, #{label},
                    #{checkTool}, #{checkArgs}, #{checkField}, #{checkOp}, #{checkValue}, #{baselineValue},
                    #{actTool}, #{actArgs}, #{intervalSeconds}, #{timeoutSeconds}, #{status},
                    0, #{nextCheckAt}, #{startedAt}, #{notifyUserIds})
            """)
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(AiWatch w);

    @Select("""
            SELECT id, owner_user_id AS ownerUserId, owner_name_snapshot AS ownerNameSnapshot,
                   session_id AS sessionId, message_id AS messageId, label,
                   check_tool AS checkTool, check_args AS checkArgs, check_field AS checkField,
                   check_op AS checkOp, check_value AS checkValue, baseline_value AS baselineValue,
                   act_tool AS actTool, act_args AS actArgs,
                   interval_seconds AS intervalSeconds, timeout_seconds AS timeoutSeconds, status,
                   attempts, last_checked_at AS lastCheckedAt, next_check_at AS nextCheckAt,
                   started_at AS startedAt, finished_at AS finishedAt, result_text AS resultText,
                   notify_user_ids AS notifyUserIds, created_at AS createdAt, updated_at AS updatedAt
            FROM ai_watch WHERE id = #{id}
            """)
    AiWatch selectById(@Param("id") Long id);

    /** 该查的那些（只看「盯着中」且到点的）。 */
    @Select("""
            SELECT id FROM ai_watch
            WHERE status = 'WATCHING' AND next_check_at <= #{now}
            ORDER BY next_check_at ASC
            LIMIT #{limit}
            """)
    List<Long> dueIds(@Param("now") LocalDateTime now, @Param("limit") int limit);

    /** 建单人自己的监视器（列表用）。 */
    @Select("""
            SELECT id, label, status, interval_seconds AS intervalSeconds, timeout_seconds AS timeoutSeconds,
                   attempts, started_at AS startedAt, finished_at AS finishedAt, result_text AS resultText,
                   next_check_at AS nextCheckAt, check_field AS checkField, check_op AS checkOp,
                   check_value AS checkValue, baseline_value AS baselineValue
            FROM ai_watch
            WHERE owner_user_id = #{ownerUserId}
            ORDER BY id DESC
            LIMIT #{limit}
            """)
    List<AiWatch> listByOwner(@Param("ownerUserId") String ownerUserId, @Param("limit") int limit);

    /** 建单人名下还盯着几条 —— 用来卡每人上限。 */
    @Select("SELECT COUNT(*) FROM ai_watch WHERE owner_user_id = #{ownerUserId} AND status = 'WATCHING'")
    int countActive(@Param("ownerUserId") String ownerUserId);

    /** 主动取消。**带 owner 条件**：别人的监视器取消不掉。 */
    @Update("""
            UPDATE ai_watch SET status = 'CANCELLED', finished_at = NOW(), result_text = '建单人取消'
            WHERE id = #{id} AND owner_user_id = #{ownerUserId} AND status = 'WATCHING'
            """)
    int cancel(@Param("id") Long id, @Param("ownerUserId") String ownerUserId);

    /**
     * 查过了、条件还没成立：推进下一次该查的时刻。
     *
     * <p>{@code next_check_at} 用**当前时刻**往后推（而不是"上一次该查的时刻 + 间隔"）——
     * 查一次花了几秒到几十秒，按原定时刻推会越积越多、最后堆积追不上。
     */
    @Update("""
            UPDATE ai_watch
            SET attempts = attempts + 1, last_checked_at = NOW(), next_check_at = DATE_ADD(NOW(), INTERVAL interval_seconds SECOND)
            WHERE id = #{id} AND status = 'WATCHING'
            """)
    int advance(@Param("id") Long id);

    /**
     * 收尾，**且这一收尾是「查过之后」定的**（条件成立 / 盯超时）。
     *
     * <p>与 {@link #finish} 分开，是因为检查次数只在 {@code advance} 那边加过一次 ——
     * 最后一查跑到终局时没人记它，于是**已经触发过的监视器会显示「查了 0 次」**，
     * 在「你在盯什么」的列表里看着像坏了。这里把最后那一查补上。
     */
    @Update("""
            UPDATE ai_watch
            SET status = #{status}, finished_at = NOW(), result_text = #{resultText},
                attempts = attempts + 1, last_checked_at = NOW()
            WHERE id = #{id} AND status = 'WATCHING'
            """)
    int finishAfterCheck(@Param("id") Long id, @Param("status") String status,
                         @Param("resultText") String resultText);

    /** 收尾（完成 / 超时 / 失败都走它）。**带 status 条件**：只收还在「盯着中」的，不会覆盖终态。 */
    @Update("""
            UPDATE ai_watch
            SET status = #{status}, finished_at = NOW(), result_text = #{resultText}
            WHERE id = #{id} AND status = 'WATCHING'
            """)
    int finish(@Param("id") Long id, @Param("status") String status, @Param("resultText") String resultText);
}
