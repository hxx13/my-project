package com.example.demo.modules.aro.entity;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class AroTrainingSession {
    private Long id;
    private String title;
    private String testContent;
    private String address;
    private LocalDateTime startTime;
    private LocalDateTime endTime;
    private Integer signNumber;
    private String examinerName;
    private String examinerNumber;
    private Integer examCertType;
    private Integer examState;
    private Integer state;
    private LocalDateTime cachedAt;
}
