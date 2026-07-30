package com.example.demo.modules.aro.entity;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class AroTrainingFavorite {
    private Long id;
    private String userId;
    private String sessionId;
    private LocalDateTime createdAt;
}
