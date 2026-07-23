package com.example.demo.modules.dahua.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

/**
 * 📦 大华门禁原始事件 DTO (Data Transfer Object)
 * 作用：仅用于反序列化大华 Webhook 推送的原始 data 层数据，绝不暴露给前端！
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public class DahuaRecordDTO {

    private String id;
    private String personName;
    private String channelName;
    private String channelCode;
    private Integer openType;
    private Integer enterOrExit;
    private Integer openResult;
    private String swingTime;

    // --- Getters & Setters ---
    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getPersonName() { return personName; }
    public void setPersonName(String personName) { this.personName = personName; }

    public String getChannelName() { return channelName; }
    public void setChannelName(String channelName) { this.channelName = channelName; }

    public String getChannelCode() { return channelCode; }
    public void setChannelCode(String channelCode) { this.channelCode = channelCode; }

    public Integer getOpenType() { return openType; }
    public void setOpenType(Integer openType) { this.openType = openType; }

    public Integer getEnterOrExit() { return enterOrExit; }
    public void setEnterOrExit(Integer enterOrExit) { this.enterOrExit = enterOrExit; }

    public Integer getOpenResult() { return openResult; }
    public void setOpenResult(Integer openResult) { this.openResult = openResult; }

    public String getSwingTime() { return swingTime; }
    public void setSwingTime(String swingTime) { this.swingTime = swingTime; }
}