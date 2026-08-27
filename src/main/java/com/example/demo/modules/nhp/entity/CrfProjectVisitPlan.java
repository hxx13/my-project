package com.example.demo.modules.nhp.entity;

import lombok.Data;

/** NHP 项目级访视编排：一个项目在某个 TP 采集哪些已发布表单。 */
@Data
public class CrfProjectVisitPlan {
    private Long id;
    private Long transplantId;
    private Long visitId;
    private Long atomId;
    private Boolean required;
    private String captureForm;
    private Integer sortOrder;
}
