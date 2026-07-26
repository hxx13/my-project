package com.example.demo.modules.notification.push.digest;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.time.LocalDateTime;
import java.util.List;

@Mapper
public interface NotifyDigestItemMapper {
    int insert(NotifyDigestItem item);
    int batchInsert(@Param("items") List<NotifyDigestItem> items);
    List<NotifyDigestItem> findPendingByUser(@Param("userId") String userId);
    List<String> findDistinctPendingUsers();
    int markSent(@Param("ids") List<Long> ids, @Param("sendTime") LocalDateTime sendTime);
    int deletePendingBySource(@Param("sourceCode") String sourceCode);
}
