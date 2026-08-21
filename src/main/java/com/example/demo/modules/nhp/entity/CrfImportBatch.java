package com.example.demo.modules.nhp.entity;

import lombok.Data;

import java.time.LocalDateTime;

/** NHP 数据导入批次（双轨采集+仪器 CSV）。 */
@Data
public class CrfImportBatch {
    private Long id;
    private Long formId;
    /** CSV/EXCEL/PAPER */
    private String fileFormat;
    private Long fileId;
    private String operatorId;
    /** 分层字段映射 JSON（String 存原始 JSON） */
    private String mappingJson;
    /** PENDING/VALIDATED/IMPORTED/FAILED */
    private String status;
    private Integer totalRows;
    private Integer successRows;
    private Integer failedRows;
    private String errorJson;
    private LocalDateTime createdAt;
}
