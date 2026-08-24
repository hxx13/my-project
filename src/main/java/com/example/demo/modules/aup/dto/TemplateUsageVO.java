package com.example.demo.modules.aup.dto;

import lombok.Data;

import java.util.List;

/** 模板（原子域）被哪些组合域钉住（GET /api/aup-template/{id}/usage）。 */
@Data
public class TemplateUsageVO {
    private Long templateId;
    private String formKey;
    private String name;
    private Integer version;
    private String kind;
    private Integer refCount;
    private List<TemplateUsageRef> refs;
}
