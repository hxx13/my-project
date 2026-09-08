package com.example.demo.modules.exam.entity;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class ExamPaperFolder {
    private Long id;
    private String name;
    private LocalDateTime createdAt;
}
