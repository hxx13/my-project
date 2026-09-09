package com.example.demo.modules.doorswiperule.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class DoorSwipeRuleConfig {

    private Long id;
    private String name;
    private Boolean enabled;
    /** JSON 数组：规则绑定的通道编号列表 */
    private String channelCodes;
    /** ALL | PERSON | DEPARTMENT | CARD */
    private String scopeType;
    /** JSON 数组：人员范围值列表（scopeType 决定取值语义） */
    private String scopeValues;
    private Integer thresholdCount;
    private Integer thresholdWindowSec;
    private Integer stayOpenDurationSec;
    private Integer cooldownSec;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
