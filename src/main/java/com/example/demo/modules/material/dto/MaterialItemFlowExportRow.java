package com.example.demo.modules.material.dto;

import lombok.Data;

/** 按物品审计流水导出行（与前端展示列一致） */
@Data
public class MaterialItemFlowExportRow {
    private String time;
    private String eventType;
    private String itemName;
    private String qty;
    private String stockAfter;
    private String applicantName;
    private String applicantGroup;
    private String requestId;
    private String remark;
}
