package com.example.demo.modules.notification.dto;

import lombok.Data;

@Data
public class UpdateNotifyTemplateRequest {
    private String titleTpl;
    private String contentTpl;
    private Integer enabled;
}
