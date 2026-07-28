package com.example.demo.modules.swipealert.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class SwipeAlertRule {

    private Long id;
    private String name;
    private Boolean enabled;
    private String channels;
    private String departments;
    private String openTypes;
    private String titleTemplate;
    private String bodyTemplate;
    private Integer thresholdCount;
    private Integer thresholdWindowSec;
    private Integer bannerDurationSec;
    private Integer minRoleLevel;
    private Integer cooldownSec;
    private Boolean notifySite;
    private Boolean notifyPush;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
