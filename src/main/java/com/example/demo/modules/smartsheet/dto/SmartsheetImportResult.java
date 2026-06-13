package com.example.demo.modules.smartsheet.dto;

import lombok.Data;
import java.util.List;
import java.util.Map;

@Data
public class SmartsheetImportResult {
    private int totalRows;
    private int importedRows;
    private int skippedRows;
    private List<String> errors;
    private List<Map<String, Object>> preview;
}
