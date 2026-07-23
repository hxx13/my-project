package com.example.demo.modules.me.badges;

import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.me.dto.PendingBadgesView;
import com.example.demo.modules.me.service.StaffUnifiedWorkInboxPendingCounter;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.util.Map;

/**
 * 消息页「待处理」合并列表条数：与前端 StaffNotificationWorkInbox.loadPendingUnified 同源逻辑见
 * {@link StaffUnifiedWorkInboxPendingCounter}，写入 pending-badges 供侧栏 staffMessagesSidebarTotal 使用。
 */
@Component
@Order(45)
public class StaffUnifiedWorkInboxBadgeContributor implements PendingBadgeContributor {

    private final StaffUnifiedWorkInboxPendingCounter staffUnifiedWorkInboxPendingCounter;

    public StaffUnifiedWorkInboxBadgeContributor(StaffUnifiedWorkInboxPendingCounter staffUnifiedWorkInboxPendingCounter) {
        this.staffUnifiedWorkInboxPendingCounter = staffUnifiedWorkInboxPendingCounter;
    }

    @Override
    public void contribute(User user, PendingBadgesView view, Map<String, Integer> badgeCounters) {
        int n = staffUnifiedWorkInboxPendingCounter.count(user);
        view.setStaffUnifiedWorkInboxPending(n);
        badgeCounters.put("STAFF_UNIFIED_WORK_INBOX_PENDING", n);
    }
}
