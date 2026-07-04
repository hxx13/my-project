package com.example.demo.modules.twin.scan.dto;

import lombok.Data;

import java.util.Map;

@Data
public class ScanAssistantSpeakRequest {
    /** welcome | alert | info */
    private String kind;
    /** 刷卡上下文（姓名、状态、房间、违规等） */
    private Map<String, Object> context;
    /** mark-used 专用：auto | click */
    private String usageSource;
}
