package com.example.demo.modules.cageshelf.entity;

import java.math.BigDecimal;

/**
 * 认领表单实例 EAV 值表条目 — cage_claim_info_value 的实体。
 * 一条记录 = 某个认领（claim）上某个字段（field）的一个值，
 * 按字段数据类型落在九个 value_* 列中的恰好一列。
 */
public class CageClaimInfoValue {
    private Long id;
    private Long claimId;        // FK → cage_claims.id
    private Long fieldId;        // FK → cage_info_field.id
    private String valueString;  // VARCHAR(512)
    private String valueText;    // TEXT
    private Long valueInt;       // BIGINT
    private BigDecimal valueDecimal; // DECIMAL(18,4)
    private String valueDate;    // VARCHAR(32)
    private String valueDatetime; // VARCHAR(32)
    private Boolean valueBool;   // TINYINT(1)
    private String valueJson;    // JSON
    private String fillSource;   // MANUAL / SYNC ...
    private String createdAt;    // DATETIME
    private String updatedAt;    // DATETIME

    // ---- getters / setters ----

    public Long getId() { return id; }
    public void setId(Long v) { this.id = v; }

    public Long getClaimId() { return claimId; }
    public void setClaimId(Long v) { this.claimId = v; }

    public Long getFieldId() { return fieldId; }
    public void setFieldId(Long v) { this.fieldId = v; }

    public String getValueString() { return valueString; }
    public void setValueString(String v) { this.valueString = v; }

    public String getValueText() { return valueText; }
    public void setValueText(String v) { this.valueText = v; }

    public Long getValueInt() { return valueInt; }
    public void setValueInt(Long v) { this.valueInt = v; }

    public BigDecimal getValueDecimal() { return valueDecimal; }
    public void setValueDecimal(BigDecimal v) { this.valueDecimal = v; }

    public String getValueDate() { return valueDate; }
    public void setValueDate(String v) { this.valueDate = v; }

    public String getValueDatetime() { return valueDatetime; }
    public void setValueDatetime(String v) { this.valueDatetime = v; }

    public Boolean getValueBool() { return valueBool; }
    public void setValueBool(Boolean v) { this.valueBool = v; }

    public String getValueJson() { return valueJson; }
    public void setValueJson(String v) { this.valueJson = v; }

    public String getFillSource() { return fillSource; }
    public void setFillSource(String v) { this.fillSource = v; }

    public String getCreatedAt() { return createdAt; }
    public void setCreatedAt(String v) { this.createdAt = v; }

    public String getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(String v) { this.updatedAt = v; }
}
