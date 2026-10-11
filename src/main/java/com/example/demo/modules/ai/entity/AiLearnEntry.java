package com.example.demo.modules.ai.entity;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * 学习池里的一条：「用户口语说法 → 对上哪条工具 / 哪个取值」。
 *
 * <p><b>状态机</b>（设计文档 §4）：
 * <pre>
 *   WATCHING 观察中 ──胜率过线──▶ ACTIVE 生效
 *                   ──胜率不过──▶ DROPPED 淘汰
 *   ACTIVE ──超管停用──▶ DISABLED（可再启用）
 * </pre>
 * 新学的一律先进 WATCHING：挂进提示词但**不改变线上行为**，只记「本该命中 vs 实际命中」。
 * 这样「自主判定学习」才有一个说得出理由的判据，而不是拍一个信任度阈值。
 */
@Data
public class AiLearnEntry {

    /** 观察中：挂进去但不生效，只采数据。 */
    public static final String WATCHING = "WATCHING";
    /** 生效：真的进提示词。 */
    public static final String ACTIVE = "ACTIVE";
    /** 停用：超管手工关掉，可再开。 */
    public static final String DISABLED = "DISABLED";
    /** 淘汰：影子期胜率不过线，自动出局。 */
    public static final String DROPPED = "DROPPED";

    private Long id;
    /** 哪一批学出来的 —— 回滚按批撤，所以每批都得留号。 */
    private String batchNo;
    /** 写进哪一层：{@code tool_phrase}（工具的说法）/ {@code arg_value}（参数取值）。 */
    private String layer;
    /** 用户的说法（从原话里截的片段）。 */
    private String phrase;
    /** 对上什么：工具名 / 参数取值。 */
    private String target;
    private String status;
    /** {@code STATS} 统计捞的 / {@code VOTE} 赞踩推的 / {@code MANUAL} 人工。 */
    private String source;
    /** 统计到的出现次数（重复学只累加，不堆行）。 */
    private Integer hits;
    /** 0–100，影子期跑出来的胜率分。 */
    private Integer trust;
    private String note;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
