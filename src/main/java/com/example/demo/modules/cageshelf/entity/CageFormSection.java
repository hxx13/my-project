package com.example.demo.modules.cageshelf.entity;

/**
 * 笼位表单章节 — cage_form_section。
 * parent_id NULL=域（Dn）；非空=子模块（Dn.mm）。
 */
public class CageFormSection {
    private Long id;
    private Long templateId;
    private Long parentId;
    private String code;
    private String label;
    private Integer sortOrder;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getTemplateId() { return templateId; }
    public void setTemplateId(Long templateId) { this.templateId = templateId; }

    public Long getParentId() { return parentId; }
    public void setParentId(Long parentId) { this.parentId = parentId; }

    public String getCode() { return code; }
    public void setCode(String code) { this.code = code; }

    public String getLabel() { return label; }
    public void setLabel(String label) { this.label = label; }

    public Integer getSortOrder() { return sortOrder; }
    public void setSortOrder(Integer sortOrder) { this.sortOrder = sortOrder; }
}
