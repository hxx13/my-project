package com.example.demo.modules.ai.entity;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * 会话级附件（目前只放**解析后的表格网格**）。
 *
 * <p>存在的理由：xlsx 这类文件模型读不了，而整张表塞进对话又会撑爆窗口。所以解析后的**全量**网格留在这里，
 * 消息里只放一段预览；模型要看更多，就按 id 调工具分段读（见「大模型处理 Excel」设计 §3）。
 *
 * <p>{@code gridJson} 存的是 {@code SpreadsheetTextExtractor.Grid} 的 JSON（含工作表名与逐行单元格），
 * 存 JSON 而不是 TSV 是因为单元格里可能有制表符/换行，用分隔符存会读错。
 */
@Data
public class AiAttachment {

    public static final String KIND_SPREADSHEET = "spreadsheet";
    /** 纯文本（md / txt）：也建模成网格 —— 单列，一行一行，于是预览/分段读那套复用不改。 */
    public static final String KIND_TEXT = "text";

    private Long id;
    private Long sessionId;
    /** 上传人（来自 JWT）。附件跟着会话走，但归属也要单独记一份便于清理与审计。 */
    private String userId;
    /** 落在哪一轮用户消息上 —— 注入预览与重放历史都靠它。 */
    private Long messageId;
    private String kind;
    private String filename;
    private Integer sheetCount;
    private Integer rowCount;
    private Integer colCount;
    private Boolean truncated;
    /** 截断原因（给人看的一句话）。 */
    private String note;
    private String gridJson;
    private LocalDateTime createdAt;
}
