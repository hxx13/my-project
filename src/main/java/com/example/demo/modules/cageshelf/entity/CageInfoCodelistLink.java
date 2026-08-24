package com.example.demo.modules.cageshelf.entity;

/**
 * 子字典联动 — cage_info_codelist_link（码表项 → 子码表）。
 */
public class CageInfoCodelistLink {
    private Long id;
    private Long itemId;
    private Long childCodelistId;
    private Integer sortOrder;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getItemId() { return itemId; }
    public void setItemId(Long itemId) { this.itemId = itemId; }

    public Long getChildCodelistId() { return childCodelistId; }
    public void setChildCodelistId(Long childCodelistId) { this.childCodelistId = childCodelistId; }

    public Integer getSortOrder() { return sortOrder; }
    public void setSortOrder(Integer sortOrder) { this.sortOrder = sortOrder; }
}
