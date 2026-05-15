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
import com.example.demo.modules.repair.entity.RepairOrder;
import com.example.demo.modules.repair.enums.RepairOrderStatus;
import com.example.demo.modules.repair.mapper.RepairOrderMapper;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.stream.Stream;

@Component
@Order(20)
public class RepairInboxFeedContributor implements InboxFeedContributor {

    private final RepairOrderMapper repairOrderMapper;
    private final CapabilityPolicyService capabilityPolicyService;
    private final UserDisplayNameService userDisplayNameService;

    public RepairInboxFeedContributor(RepairOrderMapper repairOrderMapper,
                                      CapabilityPolicyService capabilityPolicyService,
                                      UserDisplayNameService userDisplayNameService) {
        this.repairOrderMapper = repairOrderMapper;
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
        List<RepairOrder> merged = new ArrayList<>();
        merged.addAll(fetchStatus(user, RepairOrderStatus.PENDING.name(), cap));
        merged.addAll(fetchStatus(user, RepairOrderStatus.PROCESSING.name(), cap));
        ZoneId z = ZoneId.systemDefault();
        Stream<RepairOrder> stream = merged.stream()
                .filter(o -> before == null || sortTime(o).isBefore(before));
        return stream
                .sorted(Comparator.comparing((RepairOrder o) -> sortTime(o)).reversed())
                .limit(cap)
                .map(o -> toItem(o, z))
                .toList();
    }

    private List<RepairOrder> fetchStatus(User user, String status, int cap) {
        if (capabilityPolicyService.canViewAllPending(user, BizDomains.REPAIR)) {
            return repairOrderMapper.listAll(status, null, null, cap, 0);
        }
        return repairOrderMapper.listVisible(user.getId(), status, null, null, cap, 0);
    }

    private static LocalDateTime sortTime(RepairOrder o) {
        if (o.getStartTime() != null) {
            return o.getStartTime();
        }
        return o.getCreateTime() != null ? o.getCreateTime() : LocalDateTime.MIN;
    }

    private InboxItemDto toItem(RepairOrder o, ZoneId z) {
        InboxItemDto it = new InboxItemDto();
        it.setKind(BizDomains.REPAIR);
        it.setId(o.getId());
        it.setTitle(o.getLocation() == null ? "" : o.getLocation());
        String resolvedName = userDisplayNameService.resolveDisplayName(o.getApplicantId());
        String applicant = InboxDisplayHelper.applicantLine(o.getApplicantName(), o.getApplicantId(), resolvedName);
        String stZh = InboxDisplayHelper.repairOrPurchaseStatusZh(o.getStatus());
        String timePart = InboxDisplayHelper.formatShort(sortTime(o));
        it.setSubtitle(applicant + " · " + stZh + " · " + timePart);
        LocalDateTime st = sortTime(o);
        it.setSortAtMillis(st.atZone(z).toInstant().toEpochMilli());
        it.setUnread(Boolean.FALSE);
        it.getPayload().put("status", o.getStatus());
        it.getPayload().put("statusZh", stZh);
        it.getPayload().put("applicantLine", applicant);
        it.getPayload().put("timeText", timePart);
        it.getPayload().put("contentPreview", shortPreview(o.getContent(), 160));
        return it;
    }

    private static String shortPreview(String raw, int max) {
        if (!StringUtils.hasText(raw)) {
            return "";
        }
        String t = raw.trim().replaceAll("\\s+", " ");
        return t.length() <= max ? t : t.substring(0, max) + "…";
    }
}
