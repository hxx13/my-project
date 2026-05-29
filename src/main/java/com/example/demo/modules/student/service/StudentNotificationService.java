package com.example.demo.modules.student.service;

import com.example.demo.modules.auth.entity.User;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.Collections;
import java.util.Map;

@Service
public class StudentNotificationService {

    private static final Logger log = LoggerFactory.getLogger(StudentNotificationService.class);

    public Map<String, Object> getNotifications(User user, String type, int page, int size) {
        return Map.of(
                "data", Collections.emptyList(),
                "total", 0,
                "unreadCount", 0
        );
    }

    public void markRead(User user, Long noticeId) {
        // placeholder: mark notification as read
    }
}
