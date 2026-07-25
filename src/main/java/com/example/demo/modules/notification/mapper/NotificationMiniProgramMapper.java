package com.example.demo.modules.notification.mapper;

import com.example.demo.modules.notification.entity.MiniSubscribeRecord;
import com.example.demo.modules.notification.entity.NotifyDeliveryLog;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

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

    /** 更新重试次数和下次重试时间 */
    int markRetryAttempt(@Param("id") Long id,
                          @Param("nextRetryTime") LocalDateTime nextRetryTime,
                          @Param("errorCode") String errorCode,
                          @Param("errorMsg") String errorMsg);

    // ── 推送日志查询 ──

    /** 推送日志分页列表 */
    List<Map<String, Object>> listPushLogs(@Param("sourceCode") String sourceCode,
                                           @Param("channelCode") String channelCode,
                                           @Param("status") String status,
                                           @Param("startTime") LocalDateTime startTime,
                                           @Param("endTime") LocalDateTime endTime,
                                           @Param("keyword") String keyword,
                                           @Param("offset") int offset,
                                           @Param("limit") int limit);

    /** 推送日志总数 */
    long countPushLogs(@Param("sourceCode") String sourceCode,
                       @Param("channelCode") String channelCode,
                       @Param("status") String status,
                       @Param("startTime") LocalDateTime startTime,
                       @Param("endTime") LocalDateTime endTime,
                       @Param("keyword") String keyword);

    /** 推送统计概览 */
    Map<String, Object> getPushStats(@Param("startTime") LocalDateTime startTime);

    /** 单条推送日志详情 */
    Map<String, Object> getPushLogDetail(@Param("id") Long id);

    /** 各渠道健康状态 */
    List<Map<String, Object>> getChannelHealth(@Param("minutes") int minutes);
}
