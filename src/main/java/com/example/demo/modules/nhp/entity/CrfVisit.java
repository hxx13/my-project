package com.example.demo.modules.nhp.entity;

import lombok.Data;

import java.time.LocalDateTime;

/** NHP 访视/时点定义（TP-01~TP-12，事件驱动）。 */
@Data
public class CrfVisit {
    private Long id;
    /** 时点码 TP-01~TP-12 */
    private String code;
    private String name;
    private Integer seq;
    /** 是否重复事件（随访=1） */
    private Boolean repeating;
    /** 术后相对天数锚点 */
    private Integer plannedDays;
    /** 允许提前天数（非对称窗口） */
    private Integer earlyDays;
    /** 允许延后天数 */
    private Integer lateDays;
    private Boolean active;
    private LocalDateTime createdAt;
}
