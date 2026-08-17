package com.example.demo.modules.aup.entity;

import lombok.Data;
import java.time.LocalDateTime;

/** AUP 表单小章节（subsection），标识 A1/A2… */
@Data
public class FormSubsection {
    private Long id;
    private Long sectionId;
    private String code;
    private String label;
    private Integer sortOrder;
    private String description;
    /** 小节说明高亮变体 info/warn/danger/muted */
    private String descriptionTone;
    private String showWhen;
    private LocalDateTime createdAt;
}
