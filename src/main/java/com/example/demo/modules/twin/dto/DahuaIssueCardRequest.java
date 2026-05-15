package com.example.demo.modules.twin.dto;

import lombok.Data;

import java.util.List;

@Data
public class DahuaIssueCardRequest {
    private String cardNo;
    private String aroUserId;
    private String userName;
    private Long departmentId;
    private String operatorName;
    private List<String> channelResourceCodes;
    private List<Long> doorGroupIds;
    private Integer cardCategory;
}
