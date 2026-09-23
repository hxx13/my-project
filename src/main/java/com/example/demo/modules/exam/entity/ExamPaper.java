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
    private Long folderId;
    private Integer qualifyScore;
    private Integer totalTime;
    /** 有效期起（空 = 不限） */
    private LocalDateTime validFrom;
    /** 有效期止（空 = 不限） */
    private LocalDateTime validTo;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
