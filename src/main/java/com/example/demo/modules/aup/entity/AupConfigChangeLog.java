package com.example.demo.modules.aup.entity;

import lombok.Data;
import java.time.LocalDateTime;

/** AUP 配置面变更记录（只追加，不更新不删除）。 */
@Data
public class AupConfigChangeLog {
    private Long id;
    /** codelist / codelist_item / field / folder / template */
    private String entity;
    private Long entityId;
    private String entityCode;
    private String entityName;
    /** CREATE/UPDATE/DELETE/MOVE/SUBMIT_REVIEW/APPROVE/REJECT/UNFREEZE/NEW_VERSION/ARCHIVE */
    private String changeType;
    private String beforeJson;
    private String afterJson;
    private Long operatorId;
    private String operator;
    private String comment;
    private LocalDateTime createdAt;
}
