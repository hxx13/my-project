package com.example.demo.modules.cageshelf.entity;

/**
 * 笼位表单模板 — cage_form_template。
 * kind=ATOM（每域一个原子，form_key=域码 Dn）| COMPOSITE（cage_detail，钉住全部原子）。
 */
public class CageFormTemplate {
    private Long id;
    private String formKey;    // 模板键
    private String title;
    private String kind;       // ATOM|COMPOSITE
    private String dictKey;
    private String hostType;   // RECIPIENT|DONOR
    private String status;     // DRAFT|FROZEN|ARCHIVED
    private Integer version;
    private Boolean active;
    private String createdAt;
    private String updatedAt;
    /** 列表接口填充：原子数（组合） */
    private Integer atomCount;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getFormKey() { return formKey; }
    public void setFormKey(String formKey) { this.formKey = formKey; }

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }

    public String getKind() { return kind; }
    public void setKind(String kind) { this.kind = kind; }

    public String getDictKey() { return dictKey; }
    public void setDictKey(String dictKey) { this.dictKey = dictKey; }

    public String getHostType() { return hostType; }
    public void setHostType(String hostType) { this.hostType = hostType; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public Integer getVersion() { return version; }
    public void setVersion(Integer version) { this.version = version; }

    public Boolean getActive() { return active; }
    public void setActive(Boolean active) { this.active = active; }

    public String getCreatedAt() { return createdAt; }
    public void setCreatedAt(String createdAt) { this.createdAt = createdAt; }

    public String getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(String updatedAt) { this.updatedAt = updatedAt; }

    public Integer getAtomCount() { return atomCount; }
    public void setAtomCount(Integer atomCount) { this.atomCount = atomCount; }
}
