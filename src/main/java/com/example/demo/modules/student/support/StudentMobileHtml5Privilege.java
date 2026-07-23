package com.example.demo.modules.student.support;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.auth.entity.User;

/**
 * 手机 HTML5 特权（人员授权角色 ≥ ADMIN）：仅笼架网格详情、公告交互限制等；
 * 房间页「我的」分区与权限角标始终走标准 scan/analyze，不受此特权影响。
 */
public final class StudentMobileHtml5Privilege {

    /** 与人员授权页角色下拉及 {@link RoleEnum} 等级对齐 */
    public static final RoleEnum MIN_BYPASS_ROLE = RoleEnum.ADMIN;

    private StudentMobileHtml5Privilege() {}

    public static boolean isPrivileged(User user) {
        if (user == null || user.getRole() == null) {
            return false;
        }
        return user.getRole().getLevel() >= MIN_BYPASS_ROLE.getLevel();
    }
}
