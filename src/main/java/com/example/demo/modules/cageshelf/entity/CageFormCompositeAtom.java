package com.example.demo.modules.cageshelf.entity;

/**
 * 组合模板钉住的原子 — cage_form_composite_atom。
 */
public class CageFormCompositeAtom {
    private Long id;
    private Long compositeTemplateId;
    private Long atomTemplateId;
    private String atomCode;
    private Integer sortOrder;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getCompositeTemplateId() { return compositeTemplateId; }
    public void setCompositeTemplateId(Long compositeTemplateId) { this.compositeTemplateId = compositeTemplateId; }

    public Long getAtomTemplateId() { return atomTemplateId; }
    public void setAtomTemplateId(Long atomTemplateId) { this.atomTemplateId = atomTemplateId; }

    public String getAtomCode() { return atomCode; }
    public void setAtomCode(String atomCode) { this.atomCode = atomCode; }

    public Integer getSortOrder() { return sortOrder; }
    public void setSortOrder(Integer sortOrder) { this.sortOrder = sortOrder; }
}
