package com.example.demo.modules.doorswiperule.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class DoorSwipeRuleChannelScope {

    private Long id;
    private String channelCode;
    private String channelName;
    private Integer enabled;
    private String updatedBy;
    private LocalDateTime updatedAt;
}
