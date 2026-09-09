package com.example.demo.modules.cardprint.entity;

/**
 * 卡牌打印模板 — card_print_template 的实体。
 * 保存尺寸引擎输入 CardSpec 与槽位定义 Slot[] 的快照。
 */
public class CardPrintTemplate {
    private Long id;
    private String name;         // 模板名（唯一键）
    private String specJson;     // 尺寸引擎输入 CardSpec JSON
    private String slotsJson;    // 槽位定义 Slot[] JSON
    private Boolean isDefault;   // 是否默认模板
    private Boolean enabled;     // 是否启用
    private String createdBy;
    private String createdAt;    // DATETIME
    private String updatedBy;
    private String updatedAt;    // DATETIME

    // ---- getters / setters ----

    public Long getId() { return id; }
    public void setId(Long v) { this.id = v; }

    public String getName() { return name; }
    public void setName(String v) { this.name = v; }

    public String getSpecJson() { return specJson; }
    public void setSpecJson(String v) { this.specJson = v; }

    public String getSlotsJson() { return slotsJson; }
    public void setSlotsJson(String v) { this.slotsJson = v; }

    public Boolean getIsDefault() { return isDefault; }
    public void setIsDefault(Boolean v) { this.isDefault = v; }

    public Boolean getEnabled() { return enabled; }
    public void setEnabled(Boolean v) { this.enabled = v; }

    public String getCreatedBy() { return createdBy; }
    public void setCreatedBy(String v) { this.createdBy = v; }

    public String getCreatedAt() { return createdAt; }
    public void setCreatedAt(String v) { this.createdAt = v; }

    public String getUpdatedBy() { return updatedBy; }
    public void setUpdatedBy(String v) { this.updatedBy = v; }

    public String getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(String v) { this.updatedAt = v; }
}
