package com.example.demo.modules.auth.entity;

import com.example.demo.common.enums.RoleEnum;
import lombok.Data;

@Data
public class User {
    /**
     * 与人员结构库保持同名同值的唯一ID。
     */
    private String id;

    private String username;

    private String password;

    private String openId;

    private RoleEnum role = RoleEnum.STUDENT;

    /**
     * 账号状态: 1 启用, 0 禁用。
     */
    private Integer status = 1;

    /**
     * 是否需要在个人中心修改密码: 1 是, 0 否。
     */
    private Integer passwordResetRequired = 0;

    /**
     * 展示昵称：无人员库姓名时用于报修/采购/物资等申请人展示；可自助或管理员配置。
     */
    private String displayNickname;

    /**
     * 微信小程序绑定方式：STUDENT 学号绑定 / STAFF 账号密码绑定。
     */
    private String miniBindType;

    /**
     * 小程序个人配置 JSON（如房间关注区域等），随绑定账号持久化。
     */
    private String miniPreferencesJson;

    /**
     * 认证来源：WECHAT_ARO（微信+ARO 学号/工号绑定）、WEB_PASSWORD（Web 账号密码体系）。
     */
    private String authProfile;
}
