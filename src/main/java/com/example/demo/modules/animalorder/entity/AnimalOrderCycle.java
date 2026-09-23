package com.example.demo.modules.animalorder.entity;

import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 到货周期显式清单的一行。
 *
 * <p>本来是「ETA 策略 + 节假日」推算出来的；管理员「采纳」后落到这张表，
 * 之后可增删改（用户口径：不要定死）。**表为空 = 该校区仍走推算**。
 */
@Data
public class AnimalOrderCycle {
    private Long id;
    /** 浦东 | 浦西 */
    private String campus;
    /** 到货周期日（预计到货日） */
    private LocalDate cycleDate;
    private Integer sortOrder;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
