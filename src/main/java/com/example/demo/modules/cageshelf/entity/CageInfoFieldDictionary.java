package com.example.demo.modules.cageshelf.entity;

/**
 * 笼位字段字典套 — cage_info_field_dictionary。
 * structure_json 存域/子模块大纲 {domains:[{code,name,sortOrder,submodules:[...]}]}。
 */
public class CageInfoFieldDictionary {
    private Long id;
    private String dictKey;        // 稳定键（cage）
    private String name;           // 显示名
    private String species;        // 种属标签
    private String description;
    private String structureJson;  // 域/子模块大纲 JSON
    private Integer version;
    private String status;         // ACTIVE/ARCHIVED
    private Boolean active;
    private String createdAt;
    private String updatedAt;
    /** 列表接口填充：字段数（非持久列） */
    private Integer fieldCount;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getDictKey() { return dictKey; }
    public void setDictKey(String dictKey) { this.dictKey = dictKey; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getSpecies() { return species; }
    public void setSpecies(String species) { this.species = species; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public String getStructureJson() { return structureJson; }
    public void setStructureJson(String structureJson) { this.structureJson = structureJson; }

    public Integer getVersion() { return version; }
    public void setVersion(Integer version) { this.version = version; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public Boolean getActive() { return active; }
    public void setActive(Boolean active) { this.active = active; }

    public String getCreatedAt() { return createdAt; }
    public void setCreatedAt(String createdAt) { this.createdAt = createdAt; }

    public String getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(String updatedAt) { this.updatedAt = updatedAt; }

    public Integer getFieldCount() { return fieldCount; }
    public void setFieldCount(Integer fieldCount) { this.fieldCount = fieldCount; }
}
