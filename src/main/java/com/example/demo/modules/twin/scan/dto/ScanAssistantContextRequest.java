package com.example.demo.modules.twin.scan.dto;

import lombok.Data;

import java.util.Map;

@Data
public class ScanAssistantContextRequest {
    /** welcome | alert | info；默认 welcome */
    private String kind;
    /** 与前端 buildScanAssistantContext / analyze 快照字段对齐的扁平 map */
    private Map<String, Object> context;
}
