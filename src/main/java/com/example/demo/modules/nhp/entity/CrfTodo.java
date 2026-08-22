package com.example.demo.modules.nhp.entity;

import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/** NHP 待办（调度展开 + 事件规则双源，V35）。 */
@Data
public class CrfTodo {
    private Long id;
    private Long subjectId;
    private Long transplantId;
    /** TEST_ORDER / BIOPSY / TROUGH / … */
    private String todoType;
    /** SCHEDULE / EVENT_RULE */
    private String source;
    /** visit_instance_id 或事件 id */
    private String sourceRef;
    private LocalDate dueDate;
    /** OPEN / DONE / CANCELLED；OVERDUE 派生不落库 */
    private String status;
    private Boolean active;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
