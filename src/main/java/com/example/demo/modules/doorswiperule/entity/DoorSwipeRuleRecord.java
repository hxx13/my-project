package com.example.demo.modules.doorswiperule.entity;

import lombok.Data;

@Data
public class DoorSwipeRuleRecord {

    private Long id;
    private String recordId;
    private String cardNumber;
    private String channelCode;
    private String channelName;
    private Integer openType;
    private String personCode;
    private Long personId;
    private String personName;
    private String departmentId;
    private String swingTime;
    private String createTime;
    private Integer openResult;
    private Integer enterOrExit;
    private String rawJson;
    private String ingestedAt;
}
