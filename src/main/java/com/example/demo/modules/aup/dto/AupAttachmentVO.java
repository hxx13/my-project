package com.example.demo.modules.aup.dto;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * 附件 VO（关联 upload_file_record 的元信息）。
 */
@Data
public class AupAttachmentVO {

    private Long fileId;
    private String fileName;
    private String mimeType;
    private Long size;
    private String url;
    private String uploadedBy;
    private LocalDateTime createdAt;
}
