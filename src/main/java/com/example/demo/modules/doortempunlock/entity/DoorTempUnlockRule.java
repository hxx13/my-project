package com.example.demo.modules.doortempunlock.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class DoorTempUnlockRule {

    private Long id;
    private String name;
    private Boolean enabled;
    private String channelCodes;
    private Integer thresholdCount;
    private Integer thresholdWindowSec;
    private Integer unlockDurationSec;
    private Integer cooldownSec;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
