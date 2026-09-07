package com.example.demo.modules.training.entity;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class Training {
    private Long id;
    private String code;
    private String name;
    private Integer type;
    private Long paperId;
    private String ownerId;
    private Integer timeLimit;
    private String recurrence;
    private String status;
    private String createdBy;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
