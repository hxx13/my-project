package com.example.demo.modules.notification.push.recipient;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.util.List;

@Mapper
public interface NotifySourceRecipientMapper {
    List<NotifySourceRecipient> findBySourceId(@Param("sourceId") Long sourceId);
    int insert(NotifySourceRecipient recipient);
    int deleteById(@Param("id") Long id);
    int deleteBySourceId(@Param("sourceId") Long sourceId);
}
