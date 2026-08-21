package com.example.demo.modules.notification.mapper;

import com.example.demo.modules.notification.entity.StudentNotification;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/** 学生端独立通知持久层 */
@Mapper
public interface StudentNotificationMapper {

    int insert(StudentNotification notification);

    List<StudentNotification> listForUser(@Param("userId") String userId,
                                          @Param("type") String type,
                                          @Param("onlyUnread") Boolean onlyUnread,
                                          @Param("offset") int offset,
                                          @Param("size") int size);

    int countForUser(@Param("userId") String userId,
                     @Param("type") String type,
                     @Param("onlyUnread") Boolean onlyUnread);

    int markRead(@Param("userId") String userId,
                 @Param("id") String id);

    int markAllRead(@Param("userId") String userId);

    int countUnread(@Param("userId") String userId);

    /** 缓存 ARO 新闻，避免重复拉取 */
    int insertBatch(@Param("list") List<StudentNotification> list);

    /** 清除过期的 ARO 新闻缓存 */
    int deleteExpiredAroNews(@Param("beforeTime") String beforeTime);

    /** 按业务键撤回镜像通知（违规终态 / 硬删除） */
    int deleteByBiz(@Param("bizType") String bizType, @Param("bizId") String bizId);

    /** ACTIVE 内容编辑时同步镜像正文 */
    int updateContentByBiz(@Param("bizType") String bizType,
                           @Param("bizId") String bizId,
                           @Param("title") String title,
                           @Param("summary") String summary,
                           @Param("content") String content);
}
