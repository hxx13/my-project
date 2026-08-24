package com.example.demo.modules.nhp.entity;

import lombok.Data;

import java.time.LocalDateTime;

/** NHP 附件关联（crf_attachment），字段 value 引用 file_id。 */
@Data
public class CrfAttachment {

    private Long id;
    private Long recordId;
    private Long fileId;
    private String fileName;
    private String createdBy;
    private Integer deleted;
    private LocalDateTime createdAt;
}
