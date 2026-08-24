package com.example.demo.modules.aup.dto;

import lombok.Data;

/** 组合域对原子域的钉住引用。 */
@Data
public class TemplateUsageRef {
    private Long compositeTemplateId;
    private String compositeFormKey;
    private String compositeName;
    private Integer compositeVersion;
    private String atomFormKey;
}
