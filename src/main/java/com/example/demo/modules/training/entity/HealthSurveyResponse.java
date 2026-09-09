package com.example.demo.modules.training.entity;

import lombok.Data;
import java.time.LocalDateTime;

/** 健康调查表答卷（结构化 JSON，不落 PDF）。 */
@Data
public class HealthSurveyResponse {
    private String personId;
    private String dataJson;
    private LocalDateTime submittedAt;
    private LocalDateTime updatedAt;
}
