package com.example.demo.modules.material.entity;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class MaterialDemand {
    private Long id;
    private String userId;
    /** 学生需求建议文本 */
    private String suggestion;
    /** 0=未处理 1=已处理 */
    private Integer status;
    private LocalDateTime createdAt;
}
