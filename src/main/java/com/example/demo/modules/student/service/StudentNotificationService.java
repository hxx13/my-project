package com.example.demo.modules.student.service;

import com.example.demo.modules.aro.dto.AroNewsSummaryDto;
import com.example.demo.modules.aro.service.AroNewsProxyService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.notification.dto.NotificationView;
import com.example.demo.modules.notification.service.NotificationService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.*;

@Service
public class StudentNotificationService {

    private static final Logger log = LoggerFactory.getLogger(StudentNotificationService.class);

    private final NotificationService notificationService;
    private final AroNewsProxyService aroNewsProxyService;

    public StudentNotificationService(NotificationService notificationService,
                                       AroNewsProxyService aroNewsProxyService) {
        this.notificationService = notificationService;
        this.aroNewsProxyService = aroNewsProxyService;
    }

    public Map<String, Object> getNotifications(User user, String type, int page, int size) {
        boolean wantPlatform = type.isEmpty() || "PLATFORM".equals(type);
        boolean wantAro = type.isEmpty() || "ARO".equals(type);

        List<Map<String, Object>> merged = new ArrayList<>();

        // 1. Platform notifications
        if (wantPlatform) {
            try {
                Map<String, Object> result = notificationService.listForUser(
                        user.getId(), 1, 200, false, null, null, null);
                if (result != null && result.get("data") instanceof List) {
                    List<?> list = (List<?>) result.get("data");
                    for (Object item : list) {
                        if (!(item instanceof NotificationView nv)) continue;
                        Map<String, Object> m = new LinkedHashMap<>();
                        m.put("id", nv.getId());
                        m.put("title", nv.getTitle() != null ? nv.getTitle() : "");
                        m.put("summary", nv.getContent() != null
                                ? (nv.getContent().length() > 80
                                        ? nv.getContent().substring(0, 80) + "..."
                                        : nv.getContent())
                                : "");
                        m.put("type", "PLATFORM");
                        m.put("publishDate", nv.getCreateTime() != null ? nv.getCreateTime().toString() : "");
                        m.put("isRead", nv.getIsRead() != null && nv.getIsRead() == 1);
                        merged.add(m);
                    }
                }
            } catch (Exception e) {
                log.warn("Failed to fetch platform notifications for user {}", user.getId(), e);
            }
        }

        // 2. ARO official news
        if (wantAro) {
            try {
                var aroNews = aroNewsProxyService.fetchNewsList();
                if (aroNews != null && aroNews.getList() != null) {
                    for (AroNewsSummaryDto news : aroNews.getList()) {
                        Map<String, Object> m = new LinkedHashMap<>();
                        m.put("id", "aro-" + (news.getId() != null ? news.getId() : ""));
                        m.put("title", news.getNewsName() != null ? news.getNewsName() : "");
                        m.put("summary", "");
                        m.put("type", "ARO");
                        m.put("publishDate", news.getCreateTime() != null ? news.getCreateTime() : "");
                        m.put("isRead", true); // public news, always "read"
                        merged.add(m);
                    }
                }
            } catch (Exception e) {
                log.warn("Failed to fetch ARO news for user {}", user.getId(), e);
            }
        }

        // Sort by publishDate descending
        merged.sort((a, b) -> {
            String da = (String) a.getOrDefault("publishDate", "");
            String db = (String) b.getOrDefault("publishDate", "");
            return db.compareTo(da);
        });

        int total = merged.size();

        // Unread count from platform only
        int unreadCount = 0;
        try {
            Map<String, Object> unreadResult = notificationService.listForUser(
                    user.getId(), 1, 1, true, null, null, null);
            if (unreadResult != null && unreadResult.get("total") instanceof Integer) {
                unreadCount = (Integer) unreadResult.get("total");
            }
        } catch (Exception e) {
            log.warn("Failed to query unread count for user {}", user.getId(), e);
        }

        // Paginate merged list
        int offset = (page - 1) * size;
        int toIndex = Math.min(offset + size, merged.size());
        List<Map<String, Object>> paged = offset < merged.size()
                ? merged.subList(offset, toIndex)
                : Collections.emptyList();

        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("data", paged);
        resp.put("total", total);
        resp.put("unreadCount", unreadCount);
        return resp;
    }

    public void markRead(User user, Long noticeId) {
        if (noticeId == null) return;
        try {
            notificationService.markRead(user.getId(), String.valueOf(noticeId));
        } catch (Exception e) {
            log.warn("Failed to mark notification {} as read for user {}", noticeId, user.getId(), e);
        }
    }
}
