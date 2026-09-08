package com.example.demo.modules.training.entity;

import lombok.Data;

/** 资格项与表单/Word 模板绑定。 */
@Data
public class QualificationItemConfig {
    private String itemKey;
    private Long formId;
    private String wordTemplateId;
}
