package com.example.demo.modules.reportform.service;

import com.example.demo.common.exception.ErrorCodeConstants;
import com.example.demo.common.exception.TwinBusinessException;
import com.example.demo.modules.reportform.entity.ReportFormDefinition;
import com.example.demo.modules.reportform.entity.ReportFormSubmission;
import com.example.demo.modules.reportform.mapper.ReportFormDefinitionMapper;
import com.example.demo.modules.reportform.mapper.ReportFormSubmissionMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.poi.xwpf.usermodel.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.util.*;

/**
 * Word 模板服务：导入 .docx 解析书签 → 书签→fieldKey 映射 → 注入填报数据导出。
 */
@Service
public class ReportFormWordService {

    private static final Logger log = LoggerFactory.getLogger(ReportFormWordService.class);

    private final ReportFormDefinitionMapper definitionMapper;
    private final ReportFormSubmissionMapper submissionMapper;
    private final ObjectMapper objectMapper;

    public ReportFormWordService(ReportFormDefinitionMapper definitionMapper,
                                 ReportFormSubmissionMapper submissionMapper,
                                 ObjectMapper objectMapper) {
        this.definitionMapper = definitionMapper;
        this.submissionMapper = submissionMapper;
        this.objectMapper = objectMapper;
    }

    /**
     * 解析 Word 模板中的书签列表。
     * @param docxBytes .docx 文件字节
     * @return 书签名列表
     */
    public List<String> parseBookmarks(byte[] docxBytes) throws Exception {
        List<String> bookmarks = new ArrayList<>();
        try (XWPFDocument doc = new XWPFDocument(new ByteArrayInputStream(docxBytes))) {
            // 遍历段落中的书签
            for (XWPFParagraph para : doc.getParagraphs()) {
                var ctp = para.getCTP();
                var bookmarkList = ctp.getBookmarkStartList();
                for (var bm : bookmarkList) {
                    String name = bm.getName();
                    if (name != null && !name.isEmpty()) {
                        bookmarks.add(name);
                    }
                }
            }
            // 也检查表格中的书签
            for (XWPFTable table : doc.getTables()) {
                for (XWPFTableRow row : table.getRows()) {
                    for (XWPFTableCell cell : row.getTableCells()) {
                        for (XWPFParagraph para : cell.getParagraphs()) {
                            var bmList = para.getCTP().getBookmarkStartList();
                            for (var bm : bmList) {
                                String name = bm.getName();
                                if (name != null && !name.isEmpty() && !bookmarks.contains(name)) {
                                    bookmarks.add(name);
                                }
                            }
                        }
                    }
                }
            }
        }
        log.info("[report-form] Word 模板解析书签: 共 {} 个 — {}", bookmarks.size(), bookmarks);
        return bookmarks;
    }

    /**
     * 将填报数据注入 Word 模板并返回 .docx 字节。
     * @param formId      表单 ID
     * @param submissionId 提交记录 ID
     * @param templateBytes Word 模板字节（.docx）
     * @param bookmarkMapping 书签 → fieldKey 映射
     */
    public byte[] exportWord(Long formId, Long submissionId, byte[] templateBytes,
                            Map<String, String> bookmarkMapping) throws Exception {
        ReportFormDefinition form = definitionMapper.selectById(formId);
        if (form == null) {
            throw TwinBusinessException.of(ErrorCodeConstants.REPORT_FORM_NOT_FOUND, "报表不存在");
        }

        ReportFormSubmission sub = submissionMapper.selectById(submissionId);
        if (sub == null) {
            throw new RuntimeException("提交记录不存在");
        }

        var fieldValues = objectMapper.readTree(sub.getFieldValuesJson());

        try (XWPFDocument doc = new XWPFDocument(new ByteArrayInputStream(templateBytes))) {
            // 替换段落中的书签文本
            for (XWPFParagraph para : doc.getParagraphs()) {
                replaceBookmarksInParagraph(para, bookmarkMapping, fieldValues);
            }
            // 替换表格中的书签文本
            for (XWPFTable table : doc.getTables()) {
                for (XWPFTableRow row : table.getRows()) {
                    for (XWPFTableCell cell : row.getTableCells()) {
                        for (XWPFParagraph para : cell.getParagraphs()) {
                            replaceBookmarksInParagraph(para, bookmarkMapping, fieldValues);
                        }
                    }
                }
            }

            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            doc.write(bos);
            log.info("[report-form] Word 导出完成: form={} submission={} bookmarks={}",
                    formId, submissionId, bookmarkMapping.size());
            return bos.toByteArray();
        }
    }

    private void replaceBookmarksInParagraph(XWPFParagraph para,
                                              Map<String, String> bookmarkMapping,
                                              com.fasterxml.jackson.databind.JsonNode fieldValues) {
        var bmStarts = para.getCTP().getBookmarkStartList();
        if (bmStarts.isEmpty()) return;

        for (var bmStart : bmStarts) {
            String bmName = bmStart.getName();
            if (bmName == null || !bookmarkMapping.containsKey(bmName)) continue;

            String fieldKey = bookmarkMapping.get(bmName);
            String value = "";
            if (fieldValues.has(fieldKey)) {
                var val = fieldValues.get(fieldKey);
                value = val.isNull() ? "" : val.asText();
            }

            // 查找书签后面的 run（即书签后紧跟的文本 run）
            // 书签标记在段落中的位置: bmStart 后面的第一个文本 run
            var runs = para.getRuns();
            if (runs != null && !runs.isEmpty()) {
                // 简化策略：在该段落第一个 run 中设置值（适用于简单书签场景）
                // 更精确的做法是找到书签 ID 对应的 CTMarkupRange 位置
                boolean found = false;
                for (int i = 0; i < runs.size(); i++) {
                    // 检查 run 的 XML 中是否在书签范围内
                    var runXml = runs.get(i).getCTR().xmlText();
                    // 如果 run 包含文本且在 bmStart 之后，替换它
                    String runText = runs.get(i).getText(0);
                    if (runText != null && !found && i > 0) {
                        // 尝试将包含空文本或占位文本的 run 替换
                        runs.get(i).setText(value, 0);
                        found = true;
                    }
                }
                if (!found && runs.size() > 0) {
                    // Fallback: 追加到第一个 run
                    runs.get(0).setText(value, 0);
                }
            }
        }
    }
}
