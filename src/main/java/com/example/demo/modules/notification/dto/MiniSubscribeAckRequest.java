package com.example.demo.modules.notification.dto;

import lombok.Data;

@Data
public class MiniSubscribeAckRequest {
    private String templateKey;
    private Boolean accepted;
}
