package com.example.demo.modules.material.dto;

import lombok.Data;

/** 申领审计导出页表格行（与前端展示列一致） */
@Data
public class MaterialAuditGridRow {
    private String requestId;
    private String itemName;
    private String qty;
    private String status;
    private String applicantName;
    private String applicantGroup;
    private String time;
}
