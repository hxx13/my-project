package com.example.demo.modules.notification.mapper;

import com.example.demo.modules.notification.entity.MiniSubscribeRecord;
import com.example.demo.modules.notification.entity.NotifyDeliveryLog;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

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
}
