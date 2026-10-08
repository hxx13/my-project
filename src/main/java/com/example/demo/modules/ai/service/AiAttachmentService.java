package com.example.demo.modules.ai.service;

import com.example.demo.modules.ai.entity.AiAttachment;
import com.example.demo.modules.ai.excel.SpreadsheetTextExtractor;
import com.example.demo.modules.ai.mapper.AiGatewayMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 会话附件的读写。见「大模型处理 Excel」设计。
 *
 * <p>两件事在这里定死：
 * <ul>
 *   <li><b>全量进库、预览进消息</b> —— 整张表塞对话会撑爆窗口且每轮重复付费；消息里只放前若干行 + 附件 id，
 *       模型要看更多就按 id 调工具（{@code readSpreadsheetAttachment}）。</li>
 *   <li><b>归属按会话校验</b> —— 附件 id 是自增的，不校验就等于任何人能读别人的表。</li>
 * </ul>
 */
@Service
public class AiAttachmentService {

    private static final Logger log = LoggerFactory.getLogger(AiAttachmentService.class);

    /** 注入消息的预览行数：够模型认出表头与列语义，又不至于把窗口占满。 */
    public static final int PREVIEW_ROWS = 20;

    private final AiGatewayMapper mapper;
    private final SpreadsheetTextExtractor extractor;
    private final ObjectMapper objectMapper;

    public AiAttachmentService(AiGatewayMapper mapper,
                               SpreadsheetTextExtractor extractor,
                               ObjectMapper objectMapper) {
        this.mapper = mapper;
        this.extractor = extractor;
        this.objectMapper = objectMapper;
    }

    /** 解析并落库。解析失败（格式不支持/文件损坏）如实抛出，由调用方转成给用户看的一句话。 */
    public AiAttachment parseAndSave(byte[] bytes, String filename, Long sessionId,
                                     String userId, Long messageId) {
        // 只有 xlsx/xls 走网格语义；md/txt/pdf/docx 抽出来都是文本行，归 TEXT
        boolean spreadsheetKind = isSpreadsheet(filename);
        SpreadsheetTextExtractor.Grid grid = extractor.parseAny(bytes, filename);
        AiAttachment a = new AiAttachment();
        a.setSessionId(sessionId);
        a.setUserId(userId);
        a.setMessageId(messageId);
        a.setKind(spreadsheetKind ? AiAttachment.KIND_SPREADSHEET : AiAttachment.KIND_TEXT);
        a.setFilename(filename == null || filename.isBlank() ? "未命名表格" : filename);
        a.setSheetCount(grid.sheetCount());
        a.setRowCount(grid.rowCount(0));
        a.setColCount(grid.sheets().isEmpty() ? 0 : grid.sheets().get(0).rows().stream()
                .mapToInt(List::size).max().orElse(0));
        a.setTruncated(grid.truncated());
        a.setNote(grid.note());
        a.setGridJson(write(grid));
        mapper.insertAttachment(a);
        log.info("[ai-attachment] 已存 session={} id={} file={} sheets={} rows={} truncated={}",
                sessionId, a.getId(), a.getFilename(), a.getSheetCount(), a.getRowCount(), a.getTruncated());
        return a;
    }

    /** 取附件并校验它属于这个会话 —— 跨会话一律拒。 */
    public AiAttachment requireOwned(Long id, Long sessionId) {
        if (id == null || sessionId == null) {
            throw new IllegalStateException("附件不存在");
        }
        AiAttachment a = mapper.selectAttachmentById(id);
        if (a == null || !sessionId.equals(a.getSessionId())) {
            throw new IllegalStateException("附件不存在或不属于当前会话");
        }
        return a;
    }

    public List<AiAttachment> listSession(Long sessionId) {
        List<AiAttachment> list = mapper.selectAttachmentsBySession(sessionId);
        return list == null ? List.of() : list;
    }

    /** 按消息批量取（建 messages 时一次查完，不做 N+1）。 */
    public List<AiAttachment> byMessageIds(List<Long> messageIds) {
        if (messageIds == null || messageIds.isEmpty()) {
            return List.of();
        }
        List<AiAttachment> list = mapper.selectAttachmentsByMessageIds(messageIds);
        return list == null ? List.of() : list;
    }

    public int deleteBySession(Long sessionId) {
        return mapper.deleteAttachmentsBySession(sessionId);
    }

    public SpreadsheetTextExtractor.Grid grid(AiAttachment a) {
        if (a == null || a.getGridJson() == null || a.getGridJson().isBlank()) {
            return new SpreadsheetTextExtractor.Grid(List.of(), false, "");
        }
        try {
            return objectMapper.readValue(a.getGridJson(), SpreadsheetTextExtractor.Grid.class);
        } catch (Exception e) {
            log.warn("[ai-attachment] 网格反序列化失败 id={}: {}", a.getId(), e.getMessage());
            return new SpreadsheetTextExtractor.Grid(List.of(), false, "");
        }
    }

    /**
     * 注入消息的预览文本。**这是模型第一次「看到」这张表的唯一途径**（全量在库里，不在消息里）。
     *
     * <p>带行号（1 起）是刻意的：用户会说「第 3 行那个人」，行号得和用户理解的一致。
     * 列之间用制表符，别用逗号 —— 单元格里本来就可能带逗号。
     */
    public String previewText(AiAttachment a) {
        StringBuilder sb = new StringBuilder();
        sb.append("【附件】").append(a.getFilename())
          .append("（附件 id=").append(a.getId())
          .append("，").append(a.getSheetCount()).append(" 个工作表）");
        if (Boolean.TRUE.equals(a.getTruncated()) && a.getNote() != null && !a.getNote().isBlank()) {
            sb.append("\n⚠ 内容被截断：").append(a.getNote());
        }
        SpreadsheetTextExtractor.Grid grid = grid(a);
        for (int i = 0; i < grid.sheets().size(); i++) {
            SpreadsheetTextExtractor.GridSheet sheet = grid.sheets().get(i);
            List<List<String>> rows = sheet.rows();
            int shown = Math.min(rows.size(), PREVIEW_ROWS);
            sb.append("\n工作表").append(i).append("「").append(sheet.name()).append("」")
              .append(" 共 ").append(rows.size()).append(" 行")
              .append(shown < rows.size() ? ("，这里只放前 " + shown + " 行") : "")
              .append("（每行首列是行号，列间用制表符）：");
            for (int r = 0; r < shown; r++) {
                sb.append('\n').append(r + 1);
                for (String cell : rows.get(r)) {
                    sb.append('\t').append(cell);
                }
            }
            if (shown < rows.size()) {
                sb.append("\n…（其余 ").append(rows.size() - shown)
                  .append(" 行没放进消息。要看就调 readSpreadsheetAttachment，"
                          + "传 attachmentId=").append(a.getId()).append("、sheet=").append(i).append("）");
            }
        }
        return sb.toString();
    }

    /**
     * 分段读某一页：行区间 + 选列。给工具用。
     *
     * @param columns 1 起的列号；空 = 全部列
     */
    public Map<String, Object> readRows(AiAttachment a, int sheetIndex, int offset, int limit,
                                       List<Integer> columns) {
        SpreadsheetTextExtractor.Grid grid = grid(a);
        if (sheetIndex < 0 || sheetIndex >= grid.sheets().size()) {
            throw new IllegalArgumentException("没有第 " + sheetIndex + " 个工作表（共 "
                    + grid.sheets().size() + " 个，编号从 0 起）");
        }
        SpreadsheetTextExtractor.GridSheet sheet = grid.sheets().get(sheetIndex);
        List<List<String>> all = sheet.rows();
        int from = Math.max(0, Math.min(offset, all.size()));
        int to = Math.max(from, Math.min(from + Math.max(1, limit), all.size()));
        List<Map<String, Object>> rows = new ArrayList<>();
        for (int r = from; r < to; r++) {
            List<String> src = all.get(r);
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("row", r + 1);   // 1 起，与用户口中的「第几行」一致
            Map<String, Object> cells = new LinkedHashMap<>();
            if (columns == null || columns.isEmpty()) {
                for (int c = 0; c < src.size(); c++) {
                    cells.put(String.valueOf(c + 1), src.get(c));
                }
            } else {
                for (Integer c : columns) {
                    int idx = c == null ? -1 : c - 1;
                    cells.put(String.valueOf(c), idx >= 0 && idx < src.size() ? src.get(idx) : "");
                }
            }
            row.put("cells", cells);
            rows.add(row);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("attachmentId", a.getId());
        out.put("filename", a.getFilename());
        out.put("sheetIndex", sheetIndex);
        out.put("sheetName", sheet.name());
        out.put("totalRows", all.size());
        out.put("offset", from);
        out.put("returned", rows.size());
        out.put("hasMore", to < all.size());
        out.put("rows", rows);
        return out;
    }

    /** 只有 xlsx/xls 走网格语义；md/txt/pdf/docx 抽出来都是文本行。判扩展名而不是猜内容，行为可预期。 */
    private static boolean isSpreadsheet(String filename) {
        String n = filename == null ? "" : filename.trim().toLowerCase(java.util.Locale.ROOT);
        return n.endsWith(".xlsx") || n.endsWith(".xls");
    }

    private String write(SpreadsheetTextExtractor.Grid grid) {
        try {
            return objectMapper.writeValueAsString(grid);
        } catch (Exception e) {
            throw new IllegalStateException("表格内容序列化失败：" + e.getMessage(), e);
        }
    }
}
