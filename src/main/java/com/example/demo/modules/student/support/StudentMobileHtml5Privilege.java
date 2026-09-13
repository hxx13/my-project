package com.example.demo.modules.student.support;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.auth.entity.User;

/**
 * 手机 HTML5 特权（人员授权角色 ≥ SUPER_ADMIN）：仅笼架网格详情、公告交互限制等；
 * 房间页「我的」分区与权限角标始终走标准 scan/analyze，不受此特权影响。
 *
 * <p>历史背景：早期 H5 不区分教职工与学生视角，故用 ADMIN 做旁路。规范统一后，
 * 「看全部笼位」的口径已收敛为 SUPER_ADMIN+（见 {@code CageVisibilityPolicy}），此处随之下调。
 * 机制保留不动，仅调整阈值，以保证既有调用点兼容。
 */
public final class StudentMobileHtml5Privilege {

    /** 与人员授权页角色下拉及 {@link RoleEnum} 等级对齐 */
    public static final RoleEnum MIN_BYPASS_ROLE = RoleEnum.SUPER_ADMIN;

    private StudentMobileHtml5Privilege() {}

    public static boolean isPrivileged(User user) {
        if (user == null || user.getRole() == null) {
            return false;
        }
        return user.getRole().getLevel() >= MIN_BYPASS_ROLE.getLevel();
    }
}
