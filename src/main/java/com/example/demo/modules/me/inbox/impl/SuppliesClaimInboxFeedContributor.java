package com.example.demo.modules.me.inbox.impl;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.auth.service.UserDisplayNameService;
import com.example.demo.modules.me.inbox.InboxDisplayHelper;
import com.example.demo.modules.me.inbox.InboxFeedContributor;
import com.example.demo.modules.me.inbox.InboxFeedQuery;
import com.example.demo.modules.me.inbox.dto.InboxItemDto;
import com.example.demo.modules.policy.BizDomains;
import com.example.demo.modules.policy.service.CapabilityPolicyService;
import com.example.demo.modules.supplies.entity.SupplyClaimOrder;
import com.example.demo.modules.supplies.mapper.SupplyClaimOrderMapper;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Comparator;
import java.util.List;
import java.util.stream.Stream;

@Component
@Order(40)
public class SuppliesClaimInboxFeedContributor implements InboxFeedContributor {

    private final SupplyClaimOrderMapper claimOrderMapper;
    private final CapabilityPolicyService capabilityPolicyService;
    private final UserDisplayNameService userDisplayNameService;

    public SuppliesClaimInboxFeedContributor(SupplyClaimOrderMapper claimOrderMapper,
                                             CapabilityPolicyService capabilityPolicyService,
                                             UserDisplayNameService userDisplayNameService) {
        this.claimOrderMapper = claimOrderMapper;
        this.capabilityPolicyService = capabilityPolicyService;
        this.userDisplayNameService = userDisplayNameService;
    }

    @Override
    public List<InboxItemDto> contribute(InboxFeedQuery query) {
        User user = query.getUser();
        RoleEnum role = user.getRole() == null ? RoleEnum.STUDENT : user.getRole();
        if (role.getLevel() < RoleEnum.STAFF.getLevel()) {
            return List.of();
        }
        LocalDateTime before = query.getBeforeTime();
        int cap = query.getPerSourceCap();
        List<SupplyClaimOrder> rows = capabilityPolicyService.canViewAllPending(user, BizDomains.SUPPLIES_CLAIM)
                ? claimOrderMapper.listPendingAll()
                : claimOrderMapper.listPendingByUser(user.getId());
        ZoneId z = ZoneId.systemDefault();
        Stream<SupplyClaimOrder> stream = rows.stream()
                .filter(o -> o.getCreatedAt() != null && (before == null || o.getCreatedAt().isBefore(before)));
        return stream
                .sorted(Comparator.comparing(SupplyClaimOrder::getCreatedAt).reversed())
                .limit(cap)
                .map(o -> toItem(o, z))
                .toList();
    }

    private InboxItemDto toItem(SupplyClaimOrder o, ZoneId z) {
        InboxItemDto it = new InboxItemDto();
        it.setKind(BizDomains.SUPPLIES_CLAIM);
        it.setId(o.getId());
        String resolvedName = userDisplayNameService.resolveDisplayName(o.getUserId());
        String applicant = InboxDisplayHelper.applicantLine(o.getApplicantName(), o.getUserId(), resolvedName);
        String stZh = InboxDisplayHelper.supplyClaimStatusZh(o.getStatus());
        String timePart = InboxDisplayHelper.formatShort(o.getCreatedAt());
        it.setTitle("物资领用");
        it.setSubtitle(applicant + " · " + stZh + " · " + timePart);
        if (o.getCreatedAt() != null) {
            it.setSortAtMillis(o.getCreatedAt().atZone(z).toInstant().toEpochMilli());
        }
        it.setUnread(Boolean.FALSE);
        it.getPayload().put("status", o.getStatus());
        it.getPayload().put("statusZh", stZh);
        it.getPayload().put("applicantLine", applicant);
        it.getPayload().put("timeText", timePart);
        return it;
    }
}
