package com.example.demo.modules.sop.entity;

import lombok.Data;

import java.time.LocalDateTime;

/** SOP 操作文档（PDF）。文件名/大小来自 admin_file_template，联表只读。 */
@Data
public class SopDocument {
    private Long id;
    private Long nodeId;
    private String fileId;
    private String title;
    private Integer sortOrder;
    private String createdBy;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    /** 联表只读 */
    private String originalName;
    private Long sizeBytes;
    private String mimeType;
}
