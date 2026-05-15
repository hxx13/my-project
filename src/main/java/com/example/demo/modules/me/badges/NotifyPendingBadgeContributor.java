package com.example.demo.modules.me.badges;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.me.dto.PendingBadgesView;
import com.example.demo.modules.notification.service.NotificationService;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.util.Map;

@Component
@Order(50)
public class NotifyPendingBadgeContributor implements PendingBadgeContributor {

    private final NotificationService notificationService;

    public NotifyPendingBadgeContributor(NotificationService notificationService) {
        this.notificationService = notificationService;
    }

    @Override
    public void contribute(User user, PendingBadgesView view, Map<String, Integer> badgeCounters) {
        RoleEnum role = user.getRole() == null ? RoleEnum.STUDENT : user.getRole();
        int n = notificationService.countUnreadForSidebarBadge(user.getId(), role);
        view.setNotify(n);
        badgeCounters.put("NOTIFY_UNREAD", n);
        badgeCounters.put("notify", n);
    }
}
