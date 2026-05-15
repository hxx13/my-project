package com.example.demo.modules.twin.entity;

import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class DahuaSwingRecord {
    private Long id;
    private Long taskId;
    private String recordId;
    private String cardNumber;
    private Integer cardStatus;
    private String channelCode;
    private String channelName;
    private Integer openType;
    private String personCode;
    private Long personId;
    private String personName;
    private String swingTime;
    private String createTime;
    private Integer openResult;
    private Integer enterOrExit;
    private String mappingUserId;
    private String mappingCardNo;
    private Integer mappingHit;
    private Integer freezeExemptFlag;
    private String rawJson;
    private String ingestedAt;
}
