package com.example.demo.modules.twin.entity;

import java.time.LocalDateTime;

/** 管理员可维护的自动化日志码值 → 中文展示映射。 */
public class TwinAutomationDisplayMap {
    private Long id;
    /** 与 {@link com.example.demo.modules.twin.support.TwinAutomationLogDisplayHelper#MAP_AUTOMATION_TYPE} 等同 */
    private String codeType;
    private String codeValue;
    private String labelZh;
    private String remark;
    private LocalDateTime updateTime;

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getCodeType() {
        return codeType;
    }

    public void setCodeType(String codeType) {
        this.codeType = codeType;
    }

    public String getCodeValue() {
        return codeValue;
    }

    public void setCodeValue(String codeValue) {
        this.codeValue = codeValue;
    }

    public String getLabelZh() {
        return labelZh;
    }

    public void setLabelZh(String labelZh) {
        this.labelZh = labelZh;
    }

    public String getRemark() {
        return remark;
    }

    public void setRemark(String remark) {
        this.remark = remark;
    }

    public LocalDateTime getUpdateTime() {
        return updateTime;
    }

    public void setUpdateTime(LocalDateTime updateTime) {
        this.updateTime = updateTime;
    }
}
