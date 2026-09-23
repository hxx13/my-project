package com.example.demo.modules.training.entity;

import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/** 培训证书（发证即快照：之后培训/试卷删改都不影响已发证书）。 */
@Data
public class TrainingCertificate {
    private Long id;
    private String personId;
    private String personName;
    private String templateKey;
    private String templateVersion;
    private Long trainingId;
    private String trainingName;
    private Long occurrenceId;
    private Long enrollmentId;
    private LocalDate trainingDate;
    private String trainerName;
    private LocalDateTime issuedAt;
}
