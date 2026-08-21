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
    /** 真实姓名（写入 sys_user.name + personnel.name，≠ 登录账号） */
    private String name;
    /** 展示昵称，可空；与真实姓名分离，默认不自动等于账号 */
    private String displayNickname;
}
