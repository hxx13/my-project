package com.example.demo.modules.cageshelf.entity;

/**
 * 笼位表单字段（呈现层快照）— cage_form_field。
 * field_id 回指 cage_info_field.id；字段键/标签/类型在生成时快照。
 */
public class CageFormField {
    private Long id;
    private Long templateId;
    private Long sectionId;
    private Long fieldId;
    private String canonical;
    private String label;
    private String dataType;
    private String fieldType;
    private String dictKey;
    private String role;         // 字段角色快照 PK/FK/VALUE/DERIVED（缺省 VALUE），详情弹窗据此决定只读
    private String required;
    private Integer sortOrder;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getTemplateId() { return templateId; }
    public void setTemplateId(Long templateId) { this.templateId = templateId; }

    public Long getSectionId() { return sectionId; }
    public void setSectionId(Long sectionId) { this.sectionId = sectionId; }

    public Long getFieldId() { return fieldId; }
    public void setFieldId(Long fieldId) { this.fieldId = fieldId; }

    public String getCanonical() { return canonical; }
    public void setCanonical(String canonical) { this.canonical = canonical; }

    public String getLabel() { return label; }
    public void setLabel(String label) { this.label = label; }

    public String getDataType() { return dataType; }
    public void setDataType(String dataType) { this.dataType = dataType; }

    public String getFieldType() { return fieldType; }
    public void setFieldType(String fieldType) { this.fieldType = fieldType; }

    public String getDictKey() { return dictKey; }
    public void setDictKey(String dictKey) { this.dictKey = dictKey; }

    public String getRole() { return role; }
    public void setRole(String role) { this.role = role; }

    public String getRequired() { return required; }
    public void setRequired(String required) { this.required = required; }

    public Integer getSortOrder() { return sortOrder; }
    public void setSortOrder(Integer sortOrder) { this.sortOrder = sortOrder; }
}
