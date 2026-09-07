package com.example.demo.modules.training.entity;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class TrainingEnrollment {
    private Long id;
    private Long occurrenceId;
    private String traineeId;
    private String name;
    private String jobNumber;
    private String projectGroup;
    private Integer testYn;
    private Integer testFraction;
    private String roomIdsJson;
    private String roomsJson;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
