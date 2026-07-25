package com.example.demo.modules.notification.push.binding;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class UserPushBinding {
    private Long id;
    private String userId;
    private String channelCode;
    private String target;
    private Integer isVerified;
    private String verifyCode;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}
