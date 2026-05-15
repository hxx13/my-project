package com.example.demo.modules.auth.dto;

import lombok.Data;

@Data
public class AuthUserInfo {
    private String id;
    private String username;
    private String openId;
    private String role;
    /** 人员库姓名优先，其次自助昵称，再次登录名 */
    private String displayName;
    /** 自助/管理员配置的展示昵称（可空） */
    private String displayNickname;
    /** 微信小程序绑定：STUDENT | STAFF */
    private String miniBindType;
    /** 无人员库且满足教职工+账号密码绑定（或历史未记录绑定方式）时可自助改昵称 */
    private boolean canEditDisplayNickname;

    /** WECHAT_ARO | WEB_PASSWORD，与 sys_user.auth_profile 一致 */
    private String authProfile;

    /** 小程序首页默认分栏：news | announcements */
    private String miniHomeDefaultTab;
}
