package com.example.demo.modules.aup.entity;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * AUP 留痕/审计（aup_audit_log），只追加。
 * mapper 只提供 insert/select，禁 update/delete。
 */
@Data
public class AupAuditLog {

    private Long id;
    private Long aupId;
    private String actor;
    /** lab/PI/secretary/expert/admin */
    private String role;
    /** submit/pass/return/assignExpert/terminate/approve/expire/rollback/upload/delFile 等 */
    private String action;
    private String fromStage;
    private String toStage;
    private String comment;
    private LocalDateTime createdAt;
}
