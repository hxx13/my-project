package com.example.demo.modules.notification.push.dto;

import lombok.Data;

@Data
public class VerifyBindingRequest {
    private String channelCode;
    private String code;
}
