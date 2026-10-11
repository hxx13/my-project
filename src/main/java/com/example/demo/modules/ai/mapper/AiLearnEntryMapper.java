package com.example.demo.modules.ai.mapper;

import com.example.demo.modules.ai.entity.AiLearnEntry;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.util.List;
import java.util.Map;

/**
 * 学习池的读写。
 *
 * <p><b>写入是 upsert</b>：唯一键 {@code (layer, phrase, target)} 保证同一条说法对同一个目标只留一行。
 * 再学到它**取较大的那个 hits**、**不动 status** —— 不动状态是因为：一条已经转正的条目被重学打回
 * 观察中，影子期积累的证据就白费了。
 *
 * <p><b>为什么是取大值、不是累加</b>（2026-10-11 实跑踩到）：分析器每次都扫「最近 200 个会话」
 * 这个**滚动窗口**，窗口里的同一轮会被反复数到。累加的话，多跑几遍学习（超管手动点一次就算一遍）
 * 就能把 hits 堆到任意大 —— 于是「攒够 N 次样本才转正」这道闸就形同虚设，
 * 实测跑了几轮之后 6 条全部冲到 25/20/15 次、一齐转正。
 * 取大值的语义是「**这个说法在一个完整窗口里最多被看到过几次**」，重复跑不会虚增，
 * 而随着真实对话变多、窗口变满，它会自然增长。
 */
@Mapper
public interface AiLearnEntryMapper {

    @Insert("""
            INSERT INTO ai_learn_entry (batch_no, layer, phrase, target, status, source, hits, note)
            VALUES (#{batchNo}, #{layer}, #{phrase}, #{target}, #{status}, #{source}, #{hits}, #{note})
            ON DUPLICATE KEY UPDATE hits = GREATEST(hits, #{hits}), updated_at = NOW()
            """)
    int upsert(AiLearnEntry e);

    /** 全部条目（按状态、再按 hits 降序）—— 后台看用。 */
    @Select("""
            SELECT id, batch_no AS batchNo, layer, phrase, target, status, source, hits, trust, note,
                   created_at AS createdAt, updated_at AS updatedAt
            FROM ai_learn_entry
            WHERE (#{status} IS NULL OR status = #{status})
            ORDER BY FIELD(status, 'WATCHING', 'ACTIVE', 'DISABLED', 'DROPPED'), hits DESC, id DESC
            LIMIT #{limit}
            """)
    List<AiLearnEntry> list(@Param("status") String status, @Param("limit") int limit);

    /** 改状态（停用/启回）。只动状态，不碰 hits/trust。 */
    @Update("UPDATE ai_learn_entry SET status = #{status} WHERE id = #{id}")
    int updateStatus(@Param("id") Long id, @Param("status") String status);

    /** 影子期结账：写回胜率分并定去留。 */
    @Update("UPDATE ai_learn_entry SET trust = #{trust}, status = #{status} WHERE id = #{id}")
    int settle(@Param("id") Long id, @Param("trust") int trust, @Param("status") String status);

    /** **整批回滚**：撤掉某一批学出来的东西。 */
    @Update("DELETE FROM ai_learn_entry WHERE batch_no = #{batchNo}")
    int deleteBatch(@Param("batchNo") String batchNo);

    /** 一批里学了多少条（回滚前让超管看清影响面）。 */
    @Select("SELECT COUNT(*) FROM ai_learn_entry WHERE batch_no = #{batchNo}")
    int countBatch(@Param("batchNo") String batchNo);

    /**
     * 池子里**已有**的全部 (层, 说法, 目标) —— 用来算「这一批里有多少条是新的」。
     *
     * <p>一次取回、在 Java 里拼键比对：不做 N+1 查询（候选可能上百条）。
     * 键在 Java 里拼（不用 SQL 的 CONCAT）：说法里什么字符都可能有，让 SQL 拼分隔符迟早出岔子。
     */
    @Select("SELECT layer, phrase, target FROM ai_learn_entry")
    List<Map<String, Object>> allKeys();

    /**
     * **能进提示词的那些条目** —— 只有**已转正**（ACTIVE）的。
     *
     * <p>为什么观察中的不进：设计 §4 的标题句是「**新词条不直接生效**，先在影子期跑一段」。
     * 同节下面那句「挂进提示词，但不改变线上任何一个字的回复」其实自相矛盾 ——
     * 一旦挂进去，它就会影响模型挑哪个工具。**按标题句来，逻辑才自洽**：
     * 影子期就是「攒证据」，`AiLearnScorer` 攒够了才把状态改成 ACTIVE，那一刻才真的挂上去。
     *
     * <p>不这样切的话，「转正」这个动作对线上毫无影响（反正都挂着），
     * 影子期就只剩下「淘汰歧义说法」这一个作用 —— 等于装饰。
     *
     * <p>停用（DISABLED）与淘汰（DROPPED）当然也不进：前者是超管手工关的，后者是判死的。
     *
     * <p>排序按**信任分、再按命中次数**：附加层是提示词的最后一段（缓存前缀的尾巴、
     * 且越靠后越稀释注意力），所以额度要留给已经跑出成绩的那些。
     */
    @Select("""
            SELECT id, batch_no AS batchNo, layer, phrase, target, status, source, hits, trust, note,
                   created_at AS createdAt, updated_at AS updatedAt
            FROM ai_learn_entry
            WHERE status = 'ACTIVE'
            ORDER BY trust DESC, hits DESC, id DESC
            LIMIT #{limit}
            """)
    List<AiLearnEntry> listInjectable(@Param("limit") int limit);

    /**
     * 池子里所有「观察中」的条目 —— 归类那一步的输入。
     *
     * <p>归类**按池子取、不按批次取**：`upsert` 遇到同一条说法只累加 hits、**不动 batch_no**
     * （那是有意的，按批回滚要认「最初是哪批学出来的」），所以重学一遍不会把老条目挪进新批次；
     * 按批次归类会漏掉所有「早先学过、之后没再变过」的说法，而那正是池子里的绝大多数。
     */
    @Select("""
            SELECT id, batch_no AS batchNo, layer, phrase, target, status, source, hits, trust, note,
                   created_at AS createdAt, updated_at AS updatedAt
            FROM ai_learn_entry
            WHERE status = 'WATCHING'
            ORDER BY hits DESC, id ASC
            LIMIT #{limit}
            """)
    List<AiLearnEntry> listWatching(@Param("limit") int limit);

    /**
     * 按「层 + 说法 + 目标」删一条 —— 归类把某几条并成一条之后，用这个把被并掉的那几条撤下。
     *
     * <p>**只在模型明确点名了要并谁的时候才删**（`from` 里列出来的），没被点名的原样留着。
     * 这样即便模型漏答、乱答，最坏也只是「这次没并成」，不会把池子删空。
     */
    @Delete("""
            DELETE FROM ai_learn_entry
            WHERE layer = #{layer} AND phrase = #{phrase} AND target = #{target}
            """)
    int deleteByKey(@Param("layer") String layer, @Param("phrase") String phrase, @Param("target") String target);

    /**
     * **判死并写明理由** —— 归类判定「这是我们自己给的选项措辞，不学」的那些走这条。
     *
     * <p>为什么不直接删：删了就**永远查不到「为什么没学这条」**。留成 DROPPED 并写上理由，
     * 后台一眼能看到「学出了什么、没学什么、各是什么原因」。DROPPED 不进提示词（见
     * {@link #listInjectable}），所以留着也不会影响线上。
     */
    @Update("UPDATE ai_learn_entry SET status = #{status}, trust = #{trust}, note = #{note} WHERE id = #{id}")
    int retire(@Param("id") Long id, @Param("status") String status,
               @Param("trust") Integer trust, @Param("note") String note);
}
