package com.example.demo.modules.cageshelf.entity;

/**
 * 笼位域码表 — cage_info_codelist。
 * 与 NHP crf_codelist 隔离，供 cage_info_field.dict_key 引用。
 */
public class CageInfoCodelist {
    private Long id;
    private String code;
    private String name;
    private String folder;
    private String createdAt;
    private String updatedAt;
    /** 列表接口填充：选项条数 */
    private Integer itemCount;
    /** 列表接口填充：被字段 dict_key 引用数 */
    private Integer refCount;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getCode() { return code; }
    public void setCode(String code) { this.code = code; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getFolder() { return folder; }
    public void setFolder(String folder) { this.folder = folder; }

    public String getCreatedAt() { return createdAt; }
    public void setCreatedAt(String createdAt) { this.createdAt = createdAt; }

    public String getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(String updatedAt) { this.updatedAt = updatedAt; }

    public Integer getItemCount() { return itemCount; }
    public void setItemCount(Integer itemCount) { this.itemCount = itemCount; }

    public Integer getRefCount() { return refCount; }
    public void setRefCount(Integer refCount) { this.refCount = refCount; }
}
