package com.example.demo.modules.accessfusion.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class AccessCleanedEvent {
    private Long id;
    private Long batchId;
    private Long rawEventId;
    private String userId;
    private String personName;
    private String channelCode;
    private String roomId;
    private String roomName;
    private String areaName;
    private String floorName;
    private String direction;
    private Integer accessType;
    private String inferenceMethod;
    private Integer confidence;
    private String flagsJson;
    private String projectGroupNames;
    private LocalDateTime eventTime;
    private Integer needsReview;
    private String aiSuggestedDirection;
}
