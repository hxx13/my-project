package com.example.demo.modules.exam.entity;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class ExamPaperQuestion {
    private Long id;
    private Long paperId;
    private Long sectionId;
    private String questionKey;
    private String label;
    private String type;
    private Integer required;
    private String optionsJson;
    private String showWhenJson;
    private Integer sortOrder;
    private String configJson;
    private LocalDateTime createdAt;
}
