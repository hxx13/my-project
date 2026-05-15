package com.example.demo.modules.auth.dto;

import lombok.Data;

@Data
public class RegisterStaffRequest {
    private String username;
    private String password;
    /** 管理端或自助生成的推荐码 */
    private String inviteCode;
}
