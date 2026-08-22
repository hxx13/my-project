package com.example.demo.modules.nhp.entity;

import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/** NHP 访视实例（实际发生的访视，非时点定义）。 */
@Data
public class CrfVisitInstance {
    private Long id;
    private Long subjectId;
    private Long visitId;
    /** FK→crf_transplant；供体/术前/灌注可为 null（V34） */
    private Long transplantId;
    private LocalDate plannedDate;
    private LocalDate actualDate;
    /** PLANNED/STARTED/COMPLETED/SKIPPED */
    private String status;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
