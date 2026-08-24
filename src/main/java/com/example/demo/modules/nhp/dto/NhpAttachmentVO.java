package com.example.demo.modules.nhp.dto;

import lombok.Data;

import java.time.LocalDateTime;

/** NHP 附件 VO（关联 upload_file_record）。 */
@Data
public class NhpAttachmentVO {

    private Long fileId;
    private String fileName;
    private String mimeType;
    private Long size;
    private String url;
    private String uploadedBy;
    private LocalDateTime createdAt;
}
