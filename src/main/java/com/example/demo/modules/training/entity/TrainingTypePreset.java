package com.example.demo.modules.training.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class TrainingTypePreset {
    private Long id;
    private String name;
    private LocalDateTime createdAt;
}
