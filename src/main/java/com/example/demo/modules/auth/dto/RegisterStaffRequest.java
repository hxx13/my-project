package com.example.demo.modules.auth.dto;

import lombok.Data;

@Data
public class RegisterStaffRequest {
    private String username;
    private String password;
    /** 真实姓名（写入 sys_user.name + personnel.name，≠ 登录账号） */
    private String name;
    /** 管理端或自助生成的推荐码 */
    private String inviteCode;
}
