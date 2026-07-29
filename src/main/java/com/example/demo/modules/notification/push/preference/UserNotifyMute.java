package com.example.demo.modules.notification.push.preference;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class UserNotifyMute {
    private Long id;
    private String userId;
    private String sourceCode;
    private Boolean enabled;
    private Boolean muteEmail;
    private Boolean muteServerChan;
    private Boolean muteWxpusher;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}
