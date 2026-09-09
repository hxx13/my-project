package com.example.demo.modules.exam.entity;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class ExamSubmission {
    private Long id;
    private Long paperId;
    private String personId;
    private String answersJson;
    private String scoreJson;
    private Double totalScore;
    private Integer qualifyScoreSnapshot;
    private Integer qualifyYn;
    private String filesJson;
    private LocalDateTime submittedAt;
    private LocalDateTime updatedAt;

    /** 列表联查字段（非库列） */
    private String personName;
    private String jobNumber;
    private String paperTitle;
}
