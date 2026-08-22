package com.example.demo.modules.nhp.entity;

import lombok.Data;

/** NHP 访视编排：一个访视时点 = 哪些原子（V38 + V2 capture_form）。 */
@Data
public class CrfVisitPlan {
    private Long id;
    private Long visitId;
    private Long atomId;
    private Boolean required;
    /** 采集形态 PANEL/LEDGER/SERIES（表单-事件指派级） */
    private String captureForm;
    private Integer sortOrder;
}
