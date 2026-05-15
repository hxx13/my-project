package com.example.demo.modules.admin.dto;

import lombok.Data;

/**
 * 管理端创建「仅系统用户」（无 aro_personnel 绑定）的员工账号，Web 密码登录。
 */
@Data
public class CreateSystemStaffRequest {
    /** 登录账号，唯一 */
    private String username;
    /** 初始明文密码，入库前 BCrypt */
    private String password;
    /** 角色，默认 STAFF；不可为 PLATFORM_OWNER */
    private String role;
    /** 展示昵称，可空，默认与账号一致 */
    private String displayNickname;
}
