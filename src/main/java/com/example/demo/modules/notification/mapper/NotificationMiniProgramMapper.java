package com.example.demo.modules.notification.mapper;

import com.example.demo.modules.notification.entity.MiniSubscribeRecord;
import com.example.demo.modules.notification.entity.NotifyDeliveryLog;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDateTime;
import java.util.List;

@Mapper
public interface NotificationMiniProgramMapper {
    int upsertSubscription(@Param("userId") String userId,
                           @Param("templateKey") String templateKey,
                           @Param("accepted") Integer accepted);

    List<MiniSubscribeRecord> listSubscriptionsByUser(@Param("userId") String userId);

    MiniSubscribeRecord findSubscription(@Param("userId") String userId, @Param("templateKey") String templateKey);

    int insertDeliveryLog(NotifyDeliveryLog log);

    int markDeliverySuccess(@Param("id") Long id, @Param("providerMsgId") String providerMsgId);

    int markDeliveryFailed(@Param("id") Long id,
                           @Param("errorCode") String errorCode,
                           @Param("errorMsg") String errorMsg);

    /** H3: 查待重试记录 */
    List<NotifyDeliveryLog> findPendingRetry(@Param("status") String status,
                                              @Param("maxRetries") int maxRetries,
                                              @Param("now") LocalDateTime now);

    /** H4: 统计近期失败数 */
    long countRecentFailed(@Param("channel") String channel, @Param("minutes") int minutes);

    /** 更新重试次数和下次重试时间 */
    int markRetryAttempt(@Param("id") Long id,
                          @Param("nextRetryTime") LocalDateTime nextRetryTime,
                          @Param("errorCode") String errorCode,
                          @Param("errorMsg") String errorMsg);
}
