package com.example.demo.modules.reportform.dto;

import lombok.Data;

@Data
public class ReportFormImportResult {
    private String name;
    private String layoutJson;
    private int cellCount;
}
