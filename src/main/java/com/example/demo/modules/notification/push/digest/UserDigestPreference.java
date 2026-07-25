package com.example.demo.modules.notification.push.digest;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class UserDigestPreference {
    private Long id;
    private String userId;
    private String sourceCode;
    private String digestMode;
    private String scheduleTimes;
    private String overflowStrategy;
    private String scheduleDays;
    private Integer hourlyInterval;
    private Integer nightModeEnabled;
    private String nightStart;
    private String nightEnd;
    private Integer minutelyInterval;
    private String overflowCutoffTime;
    private Integer enabled;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}
