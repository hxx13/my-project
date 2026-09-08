package com.example.demo.modules.training.entity;

import lombok.Data;
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
    private String status;
    private LocalDateTime publishAt;
    private String createdBy;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
