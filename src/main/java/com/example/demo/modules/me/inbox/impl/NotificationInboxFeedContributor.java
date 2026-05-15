package com.example.demo.modules.me.inbox.impl;

import com.example.demo.modules.me.inbox.InboxDisplayHelper;
import com.example.demo.modules.me.inbox.InboxFeedContributor;
import com.example.demo.modules.me.inbox.InboxFeedQuery;
import com.example.demo.modules.me.inbox.dto.InboxItemDto;
import com.example.demo.modules.notification.dto.NotificationView;
import com.example.demo.modules.notification.mapper.NotificationMapper;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;

@Component
@Order(10)
public class NotificationInboxFeedContributor implements InboxFeedContributor {

    private final NotificationMapper notificationMapper;

    public NotificationInboxFeedContributor(NotificationMapper notificationMapper) {
        this.notificationMapper = notificationMapper;
    }

    @Override
    public List<InboxItemDto> contribute(InboxFeedQuery query) {
        List<NotificationView> rows = notificationMapper.listForUserFeed(
                query.getUser().getId(),
                query.getExcludeNotificationBizTypes(),
                query.getBeforeTime(),
                query.getPerSourceCap());
        List<InboxItemDto> out = new ArrayList<>();
        ZoneId z = ZoneId.systemDefault();
        for (NotificationView n : rows) {
            InboxItemDto it = new InboxItemDto();
            it.setKind("NOTIFICATION");
            it.setId(n.getId());
            it.setTitle(n.getTitle() == null ? "" : n.getTitle());
            String sub = n.getContent() == null ? "" : abbreviate(n.getContent(), 80);
            if (isCompletionReceipt(n)) {
                sub = "";
            }
            it.setSubtitle(sub);
            if (n.getCreateTime() != null) {
                it.setSortAtMillis(n.getCreateTime().atZone(z).toInstant().toEpochMilli());
            }
            boolean unread = n.getIsRead() == null || n.getIsRead() == 0;
            it.setUnread(unread);
            it.getPayload().put("bizType", n.getBizType());
            it.getPayload().put("bizId", n.getBizId());
            it.getPayload().put("eventType", n.getEventType());
            it.getPayload().put("eventTypeZh", eventTypeZh(n.getEventType()));
            it.getPayload().put("bizTypeZh", bizTypeZh(n.getBizType()));
            if (n.getCreateTime() != null) {
                it.getPayload().put("timeText", InboxDisplayHelper.formatShort(n.getCreateTime()));
            }
            out.add(it);
        }
        return out;
    }

    private static String eventTypeZh(String eventType) {
        if (!StringUtils.hasText(eventType)) {
            return "";
        }
        String s = eventType.trim().toUpperCase();
        return switch (s) {
            case "CREATED" -> "已创建";
            case "STARTED" -> "已接单";
            case "COMPLETED" -> "已完成";
            case "WITHDRAWN" -> "已撤回";
            case "DELETED" -> "已删除";
            case "RESTORED" -> "已恢复";
            default -> eventType.trim();
        };
    }

    private static String bizTypeZh(String bizType) {
        if (!StringUtils.hasText(bizType)) {
            return "";
        }
        String s = bizType.trim().toUpperCase();
        return switch (s) {
            case "REPAIR" -> "报修";
            case "PURCHASE" -> "采购";
            case "SUPPLIES_CLAIM" -> "物资领用";
            default -> "";
        };
    }

    private static String abbreviate(String s, int max) {
        String t = s.replace('\n', ' ').trim();
        return t.length() <= max ? t : t.substring(0, max) + "…";
    }

    /** 办结回执：动态列表不展示正文摘要，避免泄露处理细节；详情仍可查全文 */
    private static boolean isCompletionReceipt(NotificationView n) {
        if (n == null || n.getEventType() == null || n.getBizType() == null) {
            return false;
        }
        if (!"COMPLETED".equalsIgnoreCase(n.getEventType().trim())) {
            return false;
        }
        String bt = n.getBizType().trim().toUpperCase();
        return "REPAIR".equals(bt) || "PURCHASE".equals(bt) || "SUPPLIES_CLAIM".equals(bt);
    }
}
