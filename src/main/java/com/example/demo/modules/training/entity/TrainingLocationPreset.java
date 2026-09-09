package com.example.demo.modules.training.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class TrainingLocationPreset {
    private Long id;
    private String name;
    private String address;
    private LocalDateTime createdAt;
}
