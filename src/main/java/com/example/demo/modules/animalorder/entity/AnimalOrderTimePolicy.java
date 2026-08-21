package com.example.demo.modules.animalorder.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class AnimalOrderTimePolicy {
    private Long id;
    private String defaultMode;      // OPEN | CLOSED
    private String etaMode;          // RELATIVE | FIXED
    private Integer etaWorkdayOffset;
    /** FIXED: ISO weekday 1=Mon … 7=Sun */
    private Integer etaWeekday;
    private Integer active;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
