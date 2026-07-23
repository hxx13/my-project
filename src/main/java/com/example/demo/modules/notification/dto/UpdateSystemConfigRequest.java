package com.example.demo.modules.notification.dto;

import lombok.Data;

@Data
public class UpdateSystemConfigRequest {
    private String configValue;
    private String remark;
}
