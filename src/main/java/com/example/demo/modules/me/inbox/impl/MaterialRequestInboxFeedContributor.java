package com.example.demo.modules.me.inbox.impl;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.auth.service.UserDisplayNameService;
import com.example.demo.modules.material.entity.MaterialRequest;
import com.example.demo.modules.material.mapper.MaterialRequestMapper;
import com.example.demo.modules.me.inbox.InboxDisplayHelper;
import com.example.demo.modules.me.inbox.InboxFeedContributor;
import com.example.demo.modules.me.inbox.InboxFeedQuery;
import com.example.demo.modules.me.inbox.dto.InboxItemDto;
import com.example.demo.modules.policy.BizDomains;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Comparator;
import java.util.List;

@Component
@Order(42)
public class MaterialRequestInboxFeedContributor implements InboxFeedContributor {

    private final MaterialRequestMapper requestMapper;
    private final UserDisplayNameService userDisplayNameService;

    public MaterialRequestInboxFeedContributor(MaterialRequestMapper requestMapper,
                                                UserDisplayNameService userDisplayNameService) {
        this.requestMapper = requestMapper;
        this.userDisplayNameService = userDisplayNameService;
    }

    @Override
    public List<InboxItemDto> contribute(InboxFeedQuery query) {
        User user = query.getUser();
        RoleEnum role = user.getRole() == null ? RoleEnum.STUDENT : user.getRole();
        if (role.getLevel() < RoleEnum.STAFF.getLevel()) return List.of();

        LocalDateTime before = query.getBeforeTime();
        int cap = query.getPerSourceCap();
        List<MaterialRequest> rows = requestMapper.selectPendingByReviewer(null); // all pending
        ZoneId z = ZoneId.systemDefault();
        return rows.stream()
                .filter(o -> o.getCreatedAt() != null && (before == null || o.getCreatedAt().isBefore(before)))
                .sorted(Comparator.comparing(MaterialRequest::getCreatedAt).reversed())
                .limit(cap)
                .map(o -> toItem(o, z))
                .toList();
    }

    private InboxItemDto toItem(MaterialRequest r, ZoneId z) {
        InboxItemDto it = new InboxItemDto();
        it.setKind(BizDomains.MATERIAL_REQUEST);
        it.setId(r.getId());
        String resolvedName = userDisplayNameService.resolveDisplayName(r.getUserId());
        String applicant = InboxDisplayHelper.applicantLine(r.getApplicantName(), r.getUserId(), resolvedName);
        String stZh = statusZh(r.getStatus());
        String timePart = InboxDisplayHelper.formatShort(r.getCreatedAt());
        it.setTitle("学生审核");
        it.setSubtitle(applicant + " · " + stZh + " · " + timePart);
        if (r.getCreatedAt() != null) {
            it.setSortAtMillis(r.getCreatedAt().atZone(z).toInstant().toEpochMilli());
        }
        it.setUnread(Boolean.FALSE);
        it.getPayload().put("status", r.getStatus());
        it.getPayload().put("statusZh", stZh);
        it.getPayload().put("applicantLine", applicant);
        it.getPayload().put("timeText", timePart);
        return it;
    }

    private static String statusZh(String s) {
        return switch (s == null ? "" : s) {
            case "DRAFT" -> "草稿"; case "PENDING" -> "待审核"; case "FIRST_OK" -> "初审通过";
            case "APPROVED" -> "已通过"; case "REJECTED" -> "已拒绝"; case "FULFILLED" -> "已出库";
            case "RECEIVED" -> "已完成"; default -> s;
        };
    }
}
