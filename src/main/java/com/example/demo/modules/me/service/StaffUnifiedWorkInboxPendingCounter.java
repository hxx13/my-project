package com.example.demo.modules.me.service;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.notification.service.NotificationService;
import org.springframework.stereotype.Service;

/**
 * 消息页「待处理」角标：工单类未读通知条数（用户标记已读后归零，不再因工单未完结而持续提示）。
 */
@Service
public class StaffUnifiedWorkInboxPendingCounter {

    private final NotificationService notificationService;

    public StaffUnifiedWorkInboxPendingCounter(NotificationService notificationService) {
        this.notificationService = notificationService;
    }

    /** 教职工及以上：REPAIR/PURCHASE/SUPPLIES_CLAIM 未读通知数；非 STAFF 返回 0。 */
    public int count(User user) {
        if (user == null) {
            return 0;
        }
        RoleEnum role = user.getRole() == null ? RoleEnum.STUDENT : user.getRole();
        if (role.getLevel() < RoleEnum.STAFF.getLevel()) {
            return 0;
        }
        return notificationService.countUnreadStaffWorkInbox(user.getId());
    }
}
