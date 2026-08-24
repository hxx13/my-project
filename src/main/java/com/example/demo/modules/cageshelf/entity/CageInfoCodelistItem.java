package com.example.demo.modules.cageshelf.entity;

/**
 * 笼位域码表项 — cage_info_codelist_item。
 */
public class CageInfoCodelistItem {
    private Long id;
    private Long codelistId;
    private String itemCode;
    private String itemLabel;
    private Integer sortOrder;
    private String createdAt;
    private String updatedAt;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getCodelistId() { return codelistId; }
    public void setCodelistId(Long codelistId) { this.codelistId = codelistId; }

    public String getItemCode() { return itemCode; }
    public void setItemCode(String itemCode) { this.itemCode = itemCode; }

    public String getItemLabel() { return itemLabel; }
    public void setItemLabel(String itemLabel) { this.itemLabel = itemLabel; }

    public Integer getSortOrder() { return sortOrder; }
    public void setSortOrder(Integer sortOrder) { this.sortOrder = sortOrder; }

    public String getCreatedAt() { return createdAt; }
    public void setCreatedAt(String createdAt) { this.createdAt = createdAt; }

    public String getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(String updatedAt) { this.updatedAt = updatedAt; }
}
