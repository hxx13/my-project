package com.example.demo.modules.aup.entity;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * AUP 附件关联（aup_attachment），≤10个/计划，快照仅引用 file_id。
 */
@Data
public class AupAttachment {

    private Long id;
    private Long aupId;
    /** FK→upload_file_record.id */
    private Long fileId;
    private String fileName;
    private String createdBy;
    /** 软删：0 正常 / 1 已删 */
    private Integer deleted;
    private LocalDateTime createdAt;
}
