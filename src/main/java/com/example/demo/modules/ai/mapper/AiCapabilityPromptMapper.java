package com.example.demo.modules.ai.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;
import java.util.Map;

/**
 * 抽屉「能力提示词清单」只读入口（表 {@code ai_capability_prompt}）。
 *
 * <p>没有任何写 SQL —— 这张表由超管在后台维护，抽屉只负责取。排序与启用过滤一律下沉到 SQL：
 * 取回顺序即界面顺序，调用方不再重排，也就不会出现「SQL 与 Java 各排一次、结果不一致」。
 */
@Mapper
public interface AiCapabilityPromptMapper {

    /**
     * 启用中的条目，按全局排序号升序（同号按 id 兜底，保证结果稳定可断言）。
     *
     * <p>{@code WHERE enabled = 1} 是主过滤（界面只该看到启用项）；{@code enabled} 列一并取回，
     * 服务端还会再判一次 —— 单测替身不走 SQL，那条判据得在 Java 里也成立才算被测到。
     *
     * <p>列名 alias 成驼峰，调用方按 {@code groupName / promptText / sortOrder} 取值即可，
     * 不依赖 {@code map-underscore-to-camel-case} 的开关。
     */
    @Select("""
            SELECT id, group_name AS groupName, title, prompt_text AS promptText, note, sort_order AS sortOrder, enabled, audience
            FROM ai_capability_prompt
            WHERE enabled = 1
            ORDER BY sort_order ASC, id ASC
            """)
    List<Map<String, Object>> selectEnabledOrdered();

    /**
     * **全部**条目（含停用），列与 {@link #selectEnabledOrdered()} 相同，按 {@code sort_order, id} 升序。
     *
     * <p>给管理端编辑态用：它要看到停用行、也要看到 {@code enabled / audience} 两列才能原样回存；
     * 只读面（{@link #selectEnabledOrdered()}）把两者都滤掉了，照它发给编辑器会静默丢数据。
     */
    @Select("""
            SELECT id, group_name AS groupName, title, prompt_text AS promptText, note, sort_order AS sortOrder, enabled, audience
            FROM ai_capability_prompt
            ORDER BY sort_order ASC, id ASC
            """)
    List<Map<String, Object>> selectAllOrdered();

    /**
     * 某个用户**逐字发过**哪些卡片正文、各几次。键 = 卡片 id，值 = 次数。
     *
     * <p>比的是「用户发出去的那句话」与「卡片正文」**完全相等**：点卡片会原样回填并发送，
     * 手打同款句子也算（反而更准 —— 说明他真常用）。他改了几个字再发就不算，**已知并接受的损失**。
     *
     * <p>只统计 user 轮、且是该用户自己发的（{@code actor_user_id}）；卡片侧只算启用中的。
     *
     * <p><b>两表排序规则已核对一致</b>（都是 utf8mb4_unicode_ci，2026-10-11 实测）——
     * 这正是本仓库那个「跨拨列对列比较抛 1267 且被上游吞掉」的坑的所在，**换表或改表时须重核**。
     */
    @Select("""
            SELECT p.id AS cardId, COUNT(m.id) AS hits
            FROM ai_capability_prompt p
            JOIN ai_message m
              ON m.role = 'user'
             AND m.actor_user_id = #{userId}
             AND m.content = p.prompt_text
            WHERE p.enabled = 1
            GROUP BY p.id
            """)
    List<Map<String, Object>> countHitsByUser(@Param("userId") String userId);

    /** 全站热度：同 {@link #countHitsByUser} 但不限定人。新人没有个人数据时靠它回落。 */
    @Select("""
            SELECT p.id AS cardId, COUNT(m.id) AS hits
            FROM ai_capability_prompt p
            JOIN ai_message m
              ON m.role = 'user'
             AND m.content = p.prompt_text
            WHERE p.enabled = 1
            GROUP BY p.id
            """)
    List<Map<String, Object>> countHitsGlobal();
}
