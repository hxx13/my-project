package com.example.demo.modules.aup.entity;

import lombok.Data;
import java.time.LocalDateTime;

/** AUP 表单大段（section），板块标识 A/B/C… */
@Data
public class FormSection {
    private Long id;
    private Long templateId;
    private String code;
    private String label;
    private Integer sortOrder;
    /** 是否细分小章节 0/1 */
    private Boolean subdivisible;
    /** 条件显示 JSON {field,op,value}（String 存原始 JSON，Service 用 Jackson） */
    private String showWhen;
    /** 是否突出显示 0/1（前置说明等板块用作强调卡片） */
    private Boolean highlight;
    private LocalDateTime createdAt;
}
