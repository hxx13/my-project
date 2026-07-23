package com.example.demo.modules.upload.entity;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class UploadFileRecord {
    private Long id;
    private String storageKey;
    private String publicUrl;
    private String wechatFileId;
    private String originalName;
    private String mimeType;
    private Long sizeBytes;
    private String source;
    private Boolean syncedToWechat;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
