package com.example.demo.modules.exam.entity;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class ExamPaper {
    private Long id;
    private String code;
    private String title;
    private String status;
    private String createdBy;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
