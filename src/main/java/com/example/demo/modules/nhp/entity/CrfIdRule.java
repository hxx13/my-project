package com.example.demo.modules.nhp.entity;

import lombok.Data;

import java.time.LocalDateTime;

/** NHP ID 编码规则（配置，16 类对齐 04）。 */
@Data
public class CrfIdRule {
    private Long id;
    /** DON/RCP/XM/TX/FU/AE/REG/MED/LVL/ANES/PATH/HX/PERF/SMP/TST/RS */
    private String idType;
    private String pattern;
    /** 1=派生键不走取号器（ANES/HX/RS） */
    private Boolean derived;
    private String centerCode;
    private Boolean active;
    private LocalDateTime createdAt;
}
