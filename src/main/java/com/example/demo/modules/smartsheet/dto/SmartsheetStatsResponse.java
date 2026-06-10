package com.example.demo.modules.smartsheet.dto;

import lombok.Data;
import java.util.List;
import java.util.Map;

@Data
public class SmartsheetStatsResponse {
    private String columnKey;
    private String columnLabel;
    private String columnType;      // select|number|date|checkbox
    private int totalRows;
    private int nonEmptyCount;
    private int uniqueCount;        // for select type
    private Double sum;             // for number type
    private Double avg;             // for number type
    private Double min;             // for number type
    private Double max;             // for number type
    private List<Map<String, Object>> distribution; // [{label: "A", count: 3}, ...] for select
}
