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

    private RoleEnum role = RoleEnum.MEMBER;

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

    /**
     * 账号来源库：STUDENT（学生视角创建）/ STAFF（教职工视角创建）。
     */
    private String accountSource;

    private String createTime;

    /**
     * 连续登录失败次数（成功后清零）。
     */
    private Integer loginFailCount = 0;

    /**
     * 账号锁定截止时间（NULL 表示未锁定）。
     */
    private String loginLockedUntil;

    /** 联系邮箱（本地管理，用于推送通知） */
    private String contactEmail;

    /** Server酱 SendKey（用于微信推送通知） */
    private String sendKey;

    /** WxPusher UID（用于微信App推送通知） */
    private String wxPusherUid;

    // ── 统一人员资料字段（从 aro_personnel 同步 / 教职工本地填充）──

    /** 姓名 */
    private String name;

    /** 工号/学号 */
    private String jobNumber;

    /** 部门 */
    private String departmentName;

    /** 课题组名称 */
    private String projectGroupName;

    /** 归属院校 institution.id */
    private Long institutionId;

    /** 人员类型 */
    private String userTypeNames;

    /** 头像 */
    private String head;

    /** 性别 */
    private Integer gender;

    /** 手机号 */
    private String mobilePhone;

    /** 邮箱 */
    private String email;

    /** 是否校内 0/1 */
    private Integer isSchool;
}
