package com.example.demo.modules.personnel.dto;

import lombok.Data;

/** 统一人员筛选条件（全部可选，空值不参与过滤）。 */
@Data
public class PersonnelFilter {
    /** 姓名/工号/双id/手机/账号 模糊 */
    private String keyword;
    /** all=不过滤（默认） / sys=有系统账号(staff_id 非空) / nosys=无系统账号 */
    private String accountType;
    /** 课题组名称（controller 层由 groupId 解析后传入） */
    private String projectGroupName;
    /** 部门名称（controller 层由 departmentId 解析后传入） */
    private String departmentName;
    /** 角色（仅账号人，su_staff.role） */
    private String role;
    /** 账号状态（仅账号人，su_staff.status） */
    private Integer status;
    /** 校内/校外（p.is_school） */
    private Integer isSchool;
    /** 房间授权（allowed_rooms_display_zh LIKE） */
    private String roomName;
    /** 身份标签 id（EXISTS join person_identity on staff_id） */
    private Long identityTagId;
    /** 分页（Service 使用） */
    private Integer page = 1;
    private Integer pageSize = 20;
    /** 分页（Provider 使用） */
    private int limit = 20;
    private int offset = 0;
}
