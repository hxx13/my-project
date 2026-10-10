package com.example.demo.modules.twin.scan.dto;

import lombok.Data;

import java.util.List;
import java.util.Map;

@Data
public class ScanAssistantSpeakRequest {
    /** welcome | alert | info */
    private String kind;
    /** 刷卡上下文（姓名、状态、房间、违规等） */
    private Map<String, Object> context;
    /** mark-used 专用：auto | click */
    private String usageSource;
    /** 提问（ask 端点专用）：用户自由提问文本 */
    private String question;
    /** ask 专用：继续某条历史会话（优先于 newSession）。归属校验在服务端，跨用户一律拒 */
    private Long sessionId;
    /** ask 专用：开一条新会话；不传就复用该来源最近一条 */
    private Boolean newSession;
    /**
     * ask 专用：**临时会话**（刷卡后那次对话）。
     *
     * <p>一律新开、绝不复用上一次的上下文，且不进「历史对话」列表 —— 刷卡提示不该在人的历史里堆着。
     * 与 newSession 的区别就在这最后一条：新开但仍进历史。
     */
    private Boolean ephemeral;
    /** ask 专用：本轮附带的图片（data URL 或裸 base64），按顺序拼进本轮用户消息 */
    private List<String> images;

    /**
     * ask 专用：本轮附带的表格（xlsx/xls，base64）。
     *
     * <p>与图片**不同**：图片只发本轮（历史里只剩文字）；表格由服务端解析后**落库**，
     * 消息里只拼一段预览，后续追问仍看得见那张表。
     */
    private List<SpreadsheetFile> spreadsheets;

    /**
     * ask 专用：用户提问时**所在的页面路径**（如 {@code /content-manager/content}）。
     *
     * <p>只用于 L2 工具路由 —— 「在这个页面上该带上哪些工具包」（见 {@code AiPackRouter}）。
     * **绝不参与权限判定**：页面路径是前端报上来的，谁都能伪造；权限只看 JWT 里的身份。
     * 少了它，用户站在内容管理页说「帮我发个通知」时，路由只能靠词猜，猜不中就拿不到本页工具。
     */
    private String contextPage;

    @Data
    public static class SpreadsheetFile {
        /** 原始文件名，用来在消息里标识是「哪一份表」。 */
        private String filename;
        /** 内容：data URL（`data:...;base64,xxx`）或裸 base64。 */
        private String data;
    }
}
