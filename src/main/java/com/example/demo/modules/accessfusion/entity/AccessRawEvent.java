package com.example.demo.modules.accessfusion.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class AccessRawEvent {
    private Long id;
    private String source;
    private String recordId;
    private Long swingTaskId;
    private LocalDateTime swingTime;
    private String cardNumber;
    private String channelCode;
    private String channelName;
    private String personCode;
    private String personName;
    private String departmentId;
    private String departmentName;
    private String mappingUserId;
    private Integer dahuaEnterOrExit;
    private Integer openResult;
    private String rawJson;
}
