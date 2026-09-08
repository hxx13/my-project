package com.example.demo.modules.training.entity;

import lombok.Data;
import java.time.LocalDateTime;

/** 学习资料（PDF）。文件名/大小来自 admin_file_template，联表只读。 */
@Data
public class LearningMaterial {
    private Long id;
    private String fileId;
    private String title;
    private String category;
    private Integer sortOrder;
    private Integer active;
    private String createdBy;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    /** 联表只读 */
    private String originalName;
    private Long sizeBytes;
    private String mimeType;
}
