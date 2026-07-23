package com.example.demo.modules.student.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class StudentCageShelfPin {

    private Long id;
    private String userId;
    private String shelveId;
    private LocalDateTime createdAt;
}
