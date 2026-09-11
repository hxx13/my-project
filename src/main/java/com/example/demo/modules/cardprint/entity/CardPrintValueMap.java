package com.example.demo.modules.cardprint.entity;

/**
 * 卡牌打印字段值映射 — card_print_value_map 的实体。
 * 把某一字段的原值映射为渲染用简称（canonical + raw_value 唯一）。
 */
public class CardPrintValueMap {
    private Long id;
    private String canonical;   // 字段 canonical（如 animal_come_from）
    private String rawValue;    // 原值
    private String shortValue;  // 渲染用简称
    private Integer sort;       // 排序
    private String createdBy;
    private String createdAt;   // DATETIME
    private String updatedAt;   // DATETIME

    // ---- getters / setters ----

    public Long getId() { return id; }
    public void setId(Long v) { this.id = v; }

    public String getCanonical() { return canonical; }
    public void setCanonical(String v) { this.canonical = v; }

    public String getRawValue() { return rawValue; }
    public void setRawValue(String v) { this.rawValue = v; }

    public String getShortValue() { return shortValue; }
    public void setShortValue(String v) { this.shortValue = v; }

    public Integer getSort() { return sort; }
    public void setSort(Integer v) { this.sort = v; }

    public String getCreatedBy() { return createdBy; }
    public void setCreatedBy(String v) { this.createdBy = v; }

    public String getCreatedAt() { return createdAt; }
    public void setCreatedAt(String v) { this.createdAt = v; }

    public String getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(String v) { this.updatedAt = v; }
}
