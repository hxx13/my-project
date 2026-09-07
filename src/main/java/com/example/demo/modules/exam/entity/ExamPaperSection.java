package com.example.demo.modules.exam.entity;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class ExamPaperSection {
    private Long id;
    private Long paperId;
    private String code;
    private String label;
    private Integer sortOrder;
    private LocalDateTime createdAt;
}
