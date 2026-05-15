package com.example.demo.modules.me.inbox;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.me.inbox.dto.InboxFeedResponse;
import com.example.demo.modules.me.inbox.dto.InboxItemDto;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/**
 * 仅负责调用各 {@link InboxFeedContributor}、合并排序与分页；单源异常隔离。
 */
@Service
public class InboxAggregationService {

    private static final Logger log = LoggerFactory.getLogger(InboxAggregationService.class);

    private final List<InboxFeedContributor> contributors;

    public InboxAggregationService(List<InboxFeedContributor> contributors) {
        this.contributors = contributors;
    }

    public InboxFeedResponse buildFeed(User user, int limit, Long beforeMillis) {
        int safeLimit = Math.min(Math.max(limit, 1), 50);
        int perSourceCap = Math.min(safeLimit * 4, 120);
        LocalDateTime beforeTime = null;
        if (beforeMillis != null && beforeMillis > 0) {
            beforeTime = LocalDateTime.ofInstant(Instant.ofEpochMilli(beforeMillis), ZoneId.systemDefault());
        }
        RoleEnum role = user.getRole() == null ? RoleEnum.STUDENT : user.getRole();
        List<String> excludeBiz = List.of();
        if (role.getLevel() >= RoleEnum.STAFF.getLevel()) {
            excludeBiz = List.of("REPAIR", "PURCHASE", "SUPPLIES_CLAIM");
        }
        InboxFeedQuery query = InboxFeedQuery.builder()
                .user(user)
                .limit(safeLimit)
                .beforeTime(beforeTime)
                .excludeNotificationBizTypes(excludeBiz)
                .perSourceCap(perSourceCap)
                .build();

        List<InboxItemDto> merged = new ArrayList<>();
        for (InboxFeedContributor c : contributors) {
            try {
                merged.addAll(c.contribute(query));
            } catch (Exception ex) {
                log.warn("[inbox-feed] contributor {} failed: {}", c.getClass().getSimpleName(), ex.getMessage());
            }
        }
        merged.sort(Comparator.comparingLong(InboxItemDto::getSortAtMillis).reversed());
        List<InboxItemDto> page = merged.stream().limit(safeLimit).toList();

        InboxFeedResponse resp = new InboxFeedResponse();
        resp.setItems(page);
        if (page.size() == safeLimit) {
            long minMillis = page.stream().mapToLong(InboxItemDto::getSortAtMillis).min().orElse(0L);
            resp.setNextBeforeMillis(minMillis);
        }
        return resp;
    }
}
