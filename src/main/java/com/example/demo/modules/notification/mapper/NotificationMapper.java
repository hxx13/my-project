package com.example.demo.modules.notification.mapper;

import com.example.demo.modules.notification.dto.NotificationView;
import com.example.demo.modules.notification.entity.Notification;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;

@Mapper
public interface NotificationMapper {
    int insertNotification(Notification notification);

    int insertRecipient(@Param("notificationId") String notificationId, @Param("recipientUserId") String recipientUserId);

    List<NotificationView> listForUser(@Param("userId") String userId,
                                       @Param("onlyUnread") Boolean onlyUnread,
                                       @Param("limit") int limit,
                                       @Param("offset") int offset,
                                       @Param("bizType") String bizType,
                                       @Param("excludeBizType") String excludeBizType,
                                       @Param("excludeBizTypes") Collection<String> excludeBizTypes);

    /** 收件箱 Feed：按时间游标 */
    List<NotificationView> listForUserFeed(@Param("userId") String userId,
                                           @Param("excludeBizTypes") Collection<String> excludeBizTypes,
                                           @Param("beforeTime") java.time.LocalDateTime beforeTime,
                                           @Param("limit") int limit);

    int countForUser(@Param("userId") String userId,
                     @Param("onlyUnread") Boolean onlyUnread,
                     @Param("bizType") String bizType,
                     @Param("excludeBizType") String excludeBizType,
                     @Param("excludeBizTypes") Collection<String> excludeBizTypes);

    int markRead(@Param("userId") String userId, @Param("notificationId") String notificationId, @Param("readTime") LocalDateTime readTime);

    int markAllRead(@Param("userId") String userId, @Param("readTime") LocalDateTime readTime);

    int countUnread(@Param("userId") String userId);

    /**
     * 侧栏/小程序消息角标：未读且（非工单类通知，或工单类且当前用户为该单申请人）。
     * excludeBizTypes 非空时（教职工）直接排除对应 biz_type，不再校验申请人。
     */
    int countUnreadForSidebarBadge(@Param("userId") String userId,
                                   @Param("excludeBizTypes") Collection<String> excludeBizTypes);

    int deleteForUser(@Param("userId") String userId, @Param("notificationId") String notificationId);

    /** 报修/采购/物资办结回执类通知（COMPLETED）未读数量 */
    int countUnreadCompletionReceipts(@Param("userId") String userId);

    List<NotificationView> listUnreadCompletionReceipts(@Param("userId") String userId, @Param("limit") int limit);
}
