package com.example.demo.modules.ai.export.entity;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * AI 对话导出产物：一次导出留下的**文件**，跟着会话走。
 *
 * <p>两类状态共用一张表，靠 {@code content} 是否为空区分：
 * <ul>
 *   <li><b>只给过下载按钮</b>：只有 {@code paramsJson}（这次导出怎么配的），没有字节；</li>
 *   <li><b>真的下过一份</b>：前端把那份字节交回归档，历史里再下与当时逐字节相同。</li>
 * </ul>
 *
 * <p>{@code content} 单独一个查询读取 —— 列表页一次几十条，每条几十 KB 一起读会把列表拖垮。
 */
@Data
public class AiExportArtifact {

    /** 本轮只有物资申领审计这一种；以后接别的导出域就加常量。 */
    public static final String KIND_MATERIAL_AUDIT = "materialAudit";

    private Long id;
    private Long sessionId;
    /** 锚点：产出这条产物的那一轮 assistant 消息（历史回放据此把卡片放回原位）。 */
    private Long messageId;
    /** 产出人 user.id —— 只来自 JWT。 */
    private String userId;
    private String kind;
    private String label;
    private String filename;
    /** 这次导出怎么配出来的（筛选 + 小计层级）；没存字节时靠它重跑。 */
    private String paramsJson;
    /** 这一份从哪一份改出来的（原件为空）。 */
    private Long sourceId;
    private byte[] content;
    private String contentType;
    private Long contentSize;
    private LocalDateTime createdAt;
}
