package com.example.demo.modules.smartsheet.dto;

import lombok.Data;
import java.util.List;
import java.util.Map;

@Data
public class SmartsheetSheetRequest {
    private String name;
    private String description;
    private String layoutMode;
    private List<Map<String, Object>> columnsConfig;
    private Map<String, Object> rowEntitySource;
    private String templateId;
    private Integer rowLimit;
    private Map<String, Object> themeConfig;
    private Boolean isTemplate;
}
