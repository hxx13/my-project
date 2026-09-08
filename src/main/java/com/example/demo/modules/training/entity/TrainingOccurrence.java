package com.example.demo.modules.training.entity;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class TrainingOccurrence {
    private Long id;
    private Long trainingId;
    private LocalDateTime startTime;
    private LocalDateTime endTime;
    private String address;
    private Integer timeLimit;
    private String examinerName;
    private String examinerNumber;
    private String status;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
