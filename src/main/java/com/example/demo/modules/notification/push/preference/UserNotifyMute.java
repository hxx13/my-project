package com.example.demo.modules.notification.push.preference;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class UserNotifyMute {
    private Long id;
    private String userId;
    private String sourceCode;
    private Integer enabled;
    private Integer muteEmail;
    private Integer muteServerChan;
    private Integer muteWxpusher;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}
