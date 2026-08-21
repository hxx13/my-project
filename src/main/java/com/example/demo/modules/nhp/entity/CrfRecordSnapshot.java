package com.example.demo.modules.nhp.entity;

import lombok.Data;

import java.time.LocalDateTime;

/** NHP CRF 记录快照（不可变，只 insert/select）。 */
@Data
public class CrfRecordSnapshot {
    private Long id;
    private Long recordId;
    private Integer versionNo;
    /** DRAFT / COMPLETE / LOCKED */
    private String stage;
    /** donor / recipient / … / lock */
    private String bizStage;
    private String dataJson;
    private Long formId;
    private String note;
    private String createdBy;
    /** 展示用创建人姓名（非持久列，UserDisplayNameService） */
    private String createdByName;
    private LocalDateTime createdAt;
}
