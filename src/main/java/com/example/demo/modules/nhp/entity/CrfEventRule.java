package com.example.demo.modules.nhp.entity;

import lombok.Data;

import java.time.LocalDateTime;

/** NHP 事件规则：源原子 + 触发 → 下游动作（V35 §6.3）。 */
@Data
public class CrfEventRule {
    private Long id;
    /** 源事件类型=原子 code，如 SMP/MED/TX/AE/XM */
    private String sourceAtom;
    /** CREATED / STATUS_CHANGED */
    private String triggerOn;
    /** STATUS_CHANGED 目标状态，如 APPROVED */
    private String triggerCond;
    /** EXPAND_SCHEDULE / GENERATE_TODO / CREATE_EVENT / ADVANCE_STATE */
    private String action;
    /** JSON：schedule_anchor / todo_type / event_atom / target_state */
    private String actionSpec;
    private Integer sortOrder;
    private Boolean active;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
