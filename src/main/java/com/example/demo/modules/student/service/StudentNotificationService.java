package com.example.demo.modules.student.service;

import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.notification.entity.StudentNotification;
import com.example.demo.modules.notification.mapper.StudentNotificationMapper;
import com.example.demo.modules.twin.dashboard.support.ViolationMirrorNotificationSupport;
import com.example.demo.modules.twin.obligation.entity.TwinObligation;
import com.example.demo.modules.twin.obligation.service.ObligationService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.format.DateTimeFormatter;
import java.util.*;

/**
 * 学生端独立通知服务 —— 查询 sys_student_notification 表（与教职工 sys_notification 物理隔离）
 * 承载平台公告与工单通知（违规镜像 bizType=STUDENT_VIOLATION）。
 */
@Service
public class StudentNotificationService {

    private static final Logger log = LoggerFactory.getLogger(StudentNotificationService.class);

    private final StudentNotificationMapper studentNotificationMapper;
    private final ObligationService obligationService;

    public StudentNotificationService(StudentNotificationMapper studentNotificationMapper,
                                       @org.springframework.beans.factory.annotation.Autowired(required = false)
                                       ObligationService obligationService) {
        this.studentNotificationMapper = studentNotificationMapper;
        this.obligationService = obligationService;
    }

    /**
     * 获取学生通知列表。
     * type 可为空（全部）、PLATFORM、WORK_ORDER。
     */
    public Map<String, Object> getNotifications(User user, String type, int page, int size) {
        int safePage = Math.max(page, 1);
        int safeSize = Math.min(Math.max(size, 1), 50);
        int offset = (safePage - 1) * safeSize;

        String filterType = (type != null && !type.isEmpty()) ? type : null;

        List<StudentNotification> rows = studentNotificationMapper.listForUser(
                user.getId(), filterType, null, offset, safeSize);
        int total = studentNotificationMapper.countForUser(user.getId(), filterType, null);
        int unreadCount = studentNotificationMapper.countUnread(user.getId());

        List<Map<String, Object>> items = new ArrayList<>();
        DateTimeFormatter fmt = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
        for (StudentNotification sn : rows) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", sn.getId());
            m.put("title", sn.getTitle() != null ? sn.getTitle() : "");
            m.put("summary", sn.getSummary() != null ? sn.getSummary() : "");
            m.put("content", sn.getContent() != null ? sn.getContent() : "");
            m.put("type", sn.getType());
            m.put("bizType", sn.getBizType());
            m.put("bizId", sn.getBizId());
            m.put("publishDate", sn.getCreateTime() != null ? sn.getCreateTime().format(fmt) : "");
            m.put("isRead", sn.getIsRead() != null && sn.getIsRead() == 1);
            String sourceUrl = sn.getSourceUrl();
            Long obligationId = resolveObligationIdForMirror(sn);
            if (obligationId != null && obligationId > 0) {
                m.put("obligationId", obligationId);
                if (!StringUtils.hasText(sourceUrl)) {
                    sourceUrl = ViolationMirrorNotificationSupport.h5SourceUrl(obligationId);
                }
            }
            m.put("sourceUrl", sourceUrl);
            items.add(m);
        }

        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("data", items);
        resp.put("total", total);
        resp.put("unreadCount", unreadCount);
        return resp;
    }

    public void markRead(User user, String noticeId) {
        if (noticeId == null || noticeId.isBlank()) return;
        try {
            studentNotificationMapper.markRead(user.getId(), noticeId);
        } catch (Exception e) {
            log.warn("Failed to mark student notification {} as read for user {}", noticeId, user.getId(), e);
        }
    }

    /** 标记全部已读 */
    public void markAllRead(User user) {
        try {
            studentNotificationMapper.markAllRead(user.getId());
        } catch (Exception e) {
            log.warn("Failed to mark all student notifications read for user {}", user.getId(), e);
        }
    }

    private Long resolveObligationIdForMirror(StudentNotification sn) {
        if (obligationService == null || sn == null
                || !ViolationMirrorNotificationSupport.isViolationBiz(sn.getBizType())
                || !StringUtils.hasText(sn.getBizId())) {
            return null;
        }
        try {
            long violationId = Long.parseLong(sn.getBizId().trim());
            TwinObligation ob = obligationService.findByViolationId(violationId);
            return ob != null ? ob.getId() : null;
        } catch (Exception e) {
            return null;
        }
    }
}
