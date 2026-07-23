package com.example.demo.modules.me.inbox;

import com.example.demo.modules.auth.entity.User;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDateTime;
import java.util.List;

@Getter
@Builder
public class InboxFeedQuery {
    private final User user;
    private final int limit;
    private final LocalDateTime beforeTime;
    /** STAFF 排除通知中与工单重复的业务类型 */
    private final List<String> excludeNotificationBizTypes;
    /** 每个 Contributor 最多抓取条数（防止单源撑爆合并） */
    private final int perSourceCap;
}
