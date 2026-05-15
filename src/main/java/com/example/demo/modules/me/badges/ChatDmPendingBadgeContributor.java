package com.example.demo.modules.me.badges;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.chat.ChatJdbcRepository;
import com.example.demo.modules.me.dto.PendingBadgesView;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.util.Map;

/**
 * 教职工站内信未读：与 GET /api/chat/staff-contacts 中 unreadFromPeer、POST …/read 游标同源。
 */
@Component
@Order(55)
public class ChatDmPendingBadgeContributor implements PendingBadgeContributor {

    private final ChatJdbcRepository chatJdbcRepository;

    public ChatDmPendingBadgeContributor(ChatJdbcRepository chatJdbcRepository) {
        this.chatJdbcRepository = chatJdbcRepository;
    }

    @Override
    public void contribute(User user, PendingBadgesView view, Map<String, Integer> badgeCounters) {
        RoleEnum role = user.getRole() == null ? RoleEnum.STUDENT : user.getRole();
        if (role.getLevel() < RoleEnum.STAFF.getLevel()) {
            return;
        }
        int n = chatJdbcRepository.countTotalUnreadDmForUser(user.getId());
        view.setChatUnread(n);
        badgeCounters.put("CHAT_DM_UNREAD", n);
        badgeCounters.put("chatUnread", n);
    }
}
