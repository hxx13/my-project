package com.example.demo.modules.reportform.dto;

import lombok.Data;

@Data
public class ReportFormImportResult {
    private String name;
    private String source; // excel | word
    private String layoutJson;
    /** 含 columnWidths 等，导入时预计算列宽 */
    private String themeJson;
    private int cellCount;
    /** Word 导入：原 docx base64，用于自动绑定打印模板 */
    private String wordTemplateBase64;
    private String wordTemplateName;
    /** Word 书签列表 JSON 数组 */
    private String bookmarksJson;
    /** 书签 → fieldKey 映射 JSON 对象 */
    private String bookmarkMappingJson;
}
