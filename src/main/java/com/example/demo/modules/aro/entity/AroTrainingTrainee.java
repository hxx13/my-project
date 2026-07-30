package com.example.demo.modules.aro.entity;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class AroTrainingTrainee {
    private Long id;
    private Long sessionId;
    private Long examSignId;
    private String name;
    private String jobNumber;
    private String mobilePhone;
    private String projectGroup;
    private Integer testYn;
    private Integer testFraction;
    private String userId;
    private String roomIdsJson;
    private String roomsJson;
    private LocalDateTime reviewedAt;
    private LocalDateTime scoredAt;
    private LocalDateTime cachedAt;
}
