package com.example.demo.modules.cageshelf.entity;

/**
 * 笼位字段字典表条目 — cage_info_field 的实体。
 * 定义每个本地规范字段（canonical）的展示元数据与 ARO 同步来源，
 * 供笼位信息工作台按需渲染字段、读取码表、定位同步路径。
 */
public class CageInfoField {
    private Long id;
    private String canonical;      // 本地规范字段名（唯一键）
    private String label;          // 中文显示名
    private String dataType;       // number / text / boolean
    private String dictKey;        // 码表键（如 gender/rent_type），无则 null
    private String role;           // 字段角色，默认 VALUE
    private String required;       // YES / NO，默认 NO
    private String showWhen;       // 条件显示规则 JSON
    private String syncSource;     // ARO 字段路径
    private String config;         // 字段配置 JSON
    private Integer sort;          // 排序值
    private String createdAt;      // DATETIME
    private String updatedAt;      // DATETIME

    // ---- getters / setters ----

    public Long getId() { return id; }
    public void setId(Long v) { this.id = v; }

    public String getCanonical() { return canonical; }
    public void setCanonical(String v) { this.canonical = v; }

    public String getLabel() { return label; }
    public void setLabel(String v) { this.label = v; }

    public String getDataType() { return dataType; }
    public void setDataType(String v) { this.dataType = v; }

    public String getDictKey() { return dictKey; }
    public void setDictKey(String v) { this.dictKey = v; }

    public String getRole() { return role; }
    public void setRole(String v) { this.role = v; }

    public String getRequired() { return required; }
    public void setRequired(String v) { this.required = v; }

    public String getShowWhen() { return showWhen; }
    public void setShowWhen(String v) { this.showWhen = v; }

    public String getSyncSource() { return syncSource; }
    public void setSyncSource(String v) { this.syncSource = v; }

    public String getConfig() { return config; }
    public void setConfig(String v) { this.config = v; }

    public Integer getSort() { return sort; }
    public void setSort(Integer v) { this.sort = v; }

    public String getCreatedAt() { return createdAt; }
    public void setCreatedAt(String v) { this.createdAt = v; }

    public String getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(String v) { this.updatedAt = v; }
}
