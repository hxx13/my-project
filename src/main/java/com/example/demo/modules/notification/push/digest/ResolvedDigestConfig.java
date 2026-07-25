package com.example.demo.modules.notification.push.digest;

import lombok.Data;

@Data
public class ResolvedDigestConfig {
    private String digestMode;
    private String scheduleTimes;
    private String overflowStrategy;
    private String scheduleDays;
    private Integer hourlyInterval;
    private Boolean nightModeActive;
    private String nightStart;
    private String nightEnd;
    private Integer minutelyInterval;
    private String overflowCutoffTime;
}
