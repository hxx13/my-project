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
}
