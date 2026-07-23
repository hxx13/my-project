package com.example.demo.modules.auth.dto;

import lombok.Data;

@Data
public class WechatBindRequest {
    private String openId;
    private String bindType;
    private String identifier;
    private String password;
}
