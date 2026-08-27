package com.example.demo.modules.nhp.entity;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;

/** NHP entity mapped to `crf_transplant`. */
@Data
public class CrfTransplant {
    private Long id;
    private String txCode;
    private String projectName;
    private String remark;
    private Long teamId;
    /** 手动选定的 TP 码（NULL=沿用后端自动推算） */
    private String currentTp;
    /** 阶段锁定：1=非当前 TP 表单只读（仅作查看） */
    private Boolean stageLock;
    private Long donorSubjectId;
    private Long recipientSubjectId;
    private Long xmId;
    private String txOrgan;
    private String procedureType;
    private LocalDate txDate;
    private BigDecimal coldIschemiaMin;
    private BigDecimal warmIschemiaMin;
    private LocalTime reperfusionTime;
    private String inductionRegimen;
    private String maintenanceRegimen;
    private Long parentTxId;
    private String status;
    /** 项目生命周期 SCREENING/MATCHING/POST_TX/ENDPOINT（生命周期挪到项目，不再挂单只动物） */
    private String lifecycleStage;
    /** 创建人 */
    private String createdBy;
    private Boolean active;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
