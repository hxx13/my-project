package com.example.demo.modules.training.entity;

import lombok.Data;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
public class Training {
    private Long id;
    private String code;
    private String name;
    private Integer type;
    private String typeName;
    private String paperIdsJson;
    private String ownerIdsJson;
    private String recurrence;
    private Integer recurrenceDay;
    private String recurrenceTime;
    private LocalDate recurrenceStart;
    private LocalDate recurrenceEnd;
    /** 学生端校区分组（浦东/浦西），空 = 未分组 */
    private String campus;
    /** 学生端手动排序序号（同校区内升序） */
    private Integer studentSort;
    private String status;
    private LocalDateTime publishAt;
    private String createdBy;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
