package com.example.demo.modules.notification.push.recipient;

import lombok.Data;

@Data
public class NotifySourceRecipient {
    private Long id;
    private Long sourceId;
    private String perspective;
    private String scopeType;
    private String scopeValue;
}
