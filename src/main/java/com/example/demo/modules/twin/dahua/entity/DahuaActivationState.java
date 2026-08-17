package com.example.demo.modules.twin.dahua.entity;

import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class DahuaActivationState {
    private Long id;
    private Long taskId;
    private String userId;
    private String channelCode;
    private String state;
    private Integer counter;
    private String activatedAt;
    private String lastSwipeAt;
    private String scheduledExitAt;
    private String debounceUntil;
    private String updatedAt;
}
