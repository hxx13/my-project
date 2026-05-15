package com.example.demo.modules.me.inbox;

import com.example.demo.modules.me.inbox.dto.InboxItemDto;

import java.util.List;

/**
 * 收件箱 Feed 扩展点：新业务注册 Bean，由 {@link InboxAggregationService} 合并排序。
 */
public interface InboxFeedContributor {

    List<InboxItemDto> contribute(InboxFeedQuery query);
}
