package com.example.demo.modules.personnel.entity;

import lombok.Data;

/**
 * 统一人员表（以姓名为中心：staff_id 教职工账号 + job_number 工号=学号）。
 */
@Data
public class Personnel {
    private Long id;
    /** 姓名（中心标识，可重复，双 id 区分同名） */
    private String name;
    /** 教职工账号 id（sys_user.id，STAFF_ 前缀） */
    private String staffId;
    /** ARO 唯一认证 id（aro_personnel.user_id，19 位数字，学生视角索引） */
    private String aroUserId;
    /** 工号（= 学号，字母数字/纯数字，aro_personnel.job_number） */
    private String jobNumber;
    private String departmentName;
    private String projectGroupName;
    private Long institutionId;
    private String userTypeNames;
    private String head;
    private Integer gender;
    private String mobilePhone;
    private String email;
    private Integer isSchool;
    /** 官方可进房间可读列表（含校区） */
    private String allowedRoomsDisplayZh;
    /** 1=有官方可进房间 0=无 */
    private Integer hasOfficialRoomPermission;
    private String createdAt;

    // ── 账号字段（JOIN sys_user 补）──
    private String role;
    private Integer status;
    /** 教职工账号（STAFF_）登录名 */
    private String staffUsername;
    /** 学生账号（aro_user_id 对应 sys_user）登录名 */
    private String studentUsername;
    private String staffOpenId;
    private String staffAccountSource;
    private String staffDisplayNickname;
    private String staffCreateTime;
    // 通知渠道合并一套（有 staff 用 staff 侧，纯学生用 student 侧，不丢）
    private String contactEmail;
    private String sendKey;
    private String wxPusherUid;
}
