package com.example.demo.modules.aup.dto;

import lombok.Data;

import java.time.LocalDateTime;

/** 码表版本列表项（GET /api/aup-dict/{dictKey}/versions）。 */
@Data
public class DictVersionVO {
    private Long id;
    private String dictKey;
    private String name;
    private Integer version;
    private String status;
    private Long folderId;
    private LocalDateTime publishedAt;
    private String publishedBy;
    private String reviewComment;
    private Integer itemCount;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
