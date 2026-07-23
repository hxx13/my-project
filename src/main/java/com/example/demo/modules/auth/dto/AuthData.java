package com.example.demo.modules.auth.dto;

import lombok.Data;

@Data
public class AuthData {
    private String token;
    private String role;
    private String roleDesc;
    private Integer roleLevel;
    private AuthUserInfo userInfo;
}
