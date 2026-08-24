package com.example.demo.modules.notification.push.binding;

import lombok.Data;

@Data
public class PersonnelNotifyBinding {
    private Long id;
    private Long personnelId;
    private String channelCode;
    private String targetValue;
}
