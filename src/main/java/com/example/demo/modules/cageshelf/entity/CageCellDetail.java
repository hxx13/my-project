package com.example.demo.modules.cageshelf.entity;

import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.fasterxml.jackson.databind.ser.std.ToStringSerializer;

/**
 * 笼位详情 — animal_cage_id 为键存储业务数据内容。
 * 所有字段使用本地规范命名（snake_case），ARO 脏字段名通过映射表翻译后写入。
 */
public class CageCellDetail {

    @JsonSerialize(using = ToStringSerializer.class)
    private Long animalCageId;

    // 笼位状态
    private Integer cageTypeCode;
    private Integer state;
    private String stateLabel;
    private Integer rentType;
    private String cageName;

    // 笼盒
    private Boolean hasCageBox;
    private String cageBoxCode;
    private String cageBoxName;
    @JsonSerialize(using = ToStringSerializer.class)
    private Long cageBoxId;          // ARO 笼盒ID，outbox 投递时直接使用无需再解析

    // 人员与课题组
    private String piName;
    private String projectPiName;
    private String projectName;
    private String departmentName;
    private String aupNumber;
    private Long aupId;              // AUP ID（分配时写入，判定所属课题组）
    private String experimenterName;
    private String labAssistantName;

    // 实验动物
    private String animalStrainName;
    private String animalSex;
    private String animalWeekAge;
    private Integer animalMaleNumber;
    private Integer animalFemaleNumber;
    private String animalComeFrom;

    // 特殊状态
    private Boolean needsDivision;
    private Boolean needsSpecialFeeding;
    private Boolean needsTransfer;
    private Boolean hasHealthAbnormality;
    private Boolean needsCohabitation;   // 需合笼（本地状态标记，无 ARO 源）
    private String cohabitationDate;
    private String specialBreedingName;
    private String specialBreedingDesc;

    // 本地扩展
    private String experimentDesc;
    private String imagesJson;

    // 扩展 JSON
    private String aroRawData;
    private String extraData;

    // 追踪
    private String mappingVersion;
    private String syncedAt;
    private String createdAt;
    private String updatedAt;

    // ---- getters / setters ----

    public Long getAnimalCageId() { return animalCageId; }
    public void setAnimalCageId(Long v) { this.animalCageId = v; }

    public Integer getCageTypeCode() { return cageTypeCode; }
    public void setCageTypeCode(Integer v) { this.cageTypeCode = v; }

    public Integer getState() { return state; }
    public void setState(Integer v) { this.state = v; }

    public String getStateLabel() { return stateLabel; }
    public void setStateLabel(String v) { this.stateLabel = v; }

    public Integer getRentType() { return rentType; }
    public void setRentType(Integer v) { this.rentType = v; }

    public String getCageName() { return cageName; }
    public void setCageName(String v) { this.cageName = v; }

    public Boolean getHasCageBox() { return hasCageBox; }
    public void setHasCageBox(Boolean v) { this.hasCageBox = v; }

    public String getCageBoxCode() { return cageBoxCode; }
    public void setCageBoxCode(String v) { this.cageBoxCode = v; }

    public String getCageBoxName() { return cageBoxName; }
    public void setCageBoxName(String v) { this.cageBoxName = v; }

    public Long getCageBoxId() { return cageBoxId; }
    public void setCageBoxId(Long v) { this.cageBoxId = v; }

    public String getPiName() { return piName; }
    public void setPiName(String v) { this.piName = v; }

    public String getProjectPiName() { return projectPiName; }
    public void setProjectPiName(String v) { this.projectPiName = v; }

    public String getProjectName() { return projectName; }
    public void setProjectName(String v) { this.projectName = v; }

    public String getDepartmentName() { return departmentName; }
    public void setDepartmentName(String v) { this.departmentName = v; }

    public String getAupNumber() { return aupNumber; }
    public void setAupNumber(String v) { this.aupNumber = v; }

    public Long getAupId() { return aupId; }
    public void setAupId(Long v) { this.aupId = v; }

    public String getExperimenterName() { return experimenterName; }
    public void setExperimenterName(String v) { this.experimenterName = v; }

    public String getLabAssistantName() { return labAssistantName; }
    public void setLabAssistantName(String v) { this.labAssistantName = v; }

    public String getAnimalStrainName() { return animalStrainName; }
    public void setAnimalStrainName(String v) { this.animalStrainName = v; }

    public String getAnimalSex() { return animalSex; }
    public void setAnimalSex(String v) { this.animalSex = v; }

    public String getAnimalWeekAge() { return animalWeekAge; }
    public void setAnimalWeekAge(String v) { this.animalWeekAge = v; }

    public Integer getAnimalMaleNumber() { return animalMaleNumber; }
    public void setAnimalMaleNumber(Integer v) { this.animalMaleNumber = v; }

    public Integer getAnimalFemaleNumber() { return animalFemaleNumber; }
    public void setAnimalFemaleNumber(Integer v) { this.animalFemaleNumber = v; }

    public String getAnimalComeFrom() { return animalComeFrom; }
    public void setAnimalComeFrom(String v) { this.animalComeFrom = v; }

    public Boolean getNeedsDivision() { return needsDivision; }
    public void setNeedsDivision(Boolean v) { this.needsDivision = v; }

    public Boolean getNeedsSpecialFeeding() { return needsSpecialFeeding; }
    public void setNeedsSpecialFeeding(Boolean v) { this.needsSpecialFeeding = v; }

    public Boolean getNeedsTransfer() { return needsTransfer; }
    public void setNeedsTransfer(Boolean v) { this.needsTransfer = v; }

    public Boolean getHasHealthAbnormality() { return hasHealthAbnormality; }
    public void setHasHealthAbnormality(Boolean v) { this.hasHealthAbnormality = v; }

    public Boolean getNeedsCohabitation() { return needsCohabitation; }
    public void setNeedsCohabitation(Boolean v) { this.needsCohabitation = v; }

    public String getCohabitationDate() { return cohabitationDate; }
    public void setCohabitationDate(String v) { this.cohabitationDate = v; }

    public String getSpecialBreedingName() { return specialBreedingName; }
    public void setSpecialBreedingName(String v) { this.specialBreedingName = v; }

    public String getSpecialBreedingDesc() { return specialBreedingDesc; }
    public void setSpecialBreedingDesc(String v) { this.specialBreedingDesc = v; }

    public String getExperimentDesc() { return experimentDesc; }
    public void setExperimentDesc(String v) { this.experimentDesc = v; }

    public String getImagesJson() { return imagesJson; }
    public void setImagesJson(String v) { this.imagesJson = v; }

    public String getAroRawData() { return aroRawData; }
    public void setAroRawData(String v) { this.aroRawData = v; }

    public String getExtraData() { return extraData; }
    public void setExtraData(String v) { this.extraData = v; }

    public String getMappingVersion() { return mappingVersion; }
    public void setMappingVersion(String v) { this.mappingVersion = v; }

    public String getSyncedAt() { return syncedAt; }
    public void setSyncedAt(String v) { this.syncedAt = v; }

    public String getCreatedAt() { return createdAt; }
    public void setCreatedAt(String v) { this.createdAt = v; }

    public String getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(String v) { this.updatedAt = v; }
}
