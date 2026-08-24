package com.example.demo.modules.cageshelf.entity;

import java.math.BigDecimal;

/**
 * 笼位级表单值 — cage_info_value。
 * 关键信息表单是「固定信息模板」，值直接挂笼位（animal_cage_id），与认领无关。
 */
public class CageInfoValue {
    private Long id;
    private Long animalCageId;   // FK → 笼位
    private Long fieldId;        // FK → cage_info_field.id
    private String valueString;
    private String valueText;
    private Long valueInt;
    private BigDecimal valueDecimal;
    private String valueDate;
    private String valueDatetime;
    private Boolean valueBool;
    private String valueJson;
    private String fillSource;   // SYNC / MANUAL
    private String createdAt;
    private String updatedAt;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getAnimalCageId() { return animalCageId; }
    public void setAnimalCageId(Long animalCageId) { this.animalCageId = animalCageId; }

    public Long getFieldId() { return fieldId; }
    public void setFieldId(Long fieldId) { this.fieldId = fieldId; }

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
