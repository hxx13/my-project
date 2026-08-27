package com.example.demo.modules.nhp.entity;

import lombok.Data;

import java.time.LocalDateTime;

/** NHP 表单：原子模板(DOMAIN/MODULE) 或 组合模板(TEMPLATE)。 */
@Data
public class CrfForm {
    private Long id;
    private Long studyId;
    /** 原子编码 D1~D10，或组合模板 formKey 如 nhp-crf */
    private String code;
    private String name;
    /** DOMAIN/MODULE=原子；TEMPLATE=组合；PUBLIC 保留 */
    private String formType;
    private Integer version;
    /** DRAFT/FREEZING/FROZEN/ARCHIVED */
    private String status;
    private String description;
    /** 归属文件夹 FK→aup_folder.id（owner_type=NHP_FORM）；NULL=未分类。按 code 整组维护 */
    private Long folderId;
    /** 事件锚点 ENROLL/PRE_TX/DAY0/POST_TX/…（V34 schedule） */
    private String eventAnchor;
    /** 频次 ONCE/PER_TP/EVENT/…；≠ONCE 即重复（无 repeat_flag） */
    private String frequency;
    /** 采集形态 SERIES/LEDGER/PANEL（V35 推导） */
    private String captureForm;
    /** 宿主：DONOR=供体域 / RECIPIENT=受体域（表单划分；新建原子域时显式指定，不靠域码推导） */
    private String hostType;
    private Boolean active;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
