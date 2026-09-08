package com.example.demo.modules.training.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class TrainingFavorite {
    private String userId;
    private Long trainingId;
    private LocalDateTime createdAt;
}
