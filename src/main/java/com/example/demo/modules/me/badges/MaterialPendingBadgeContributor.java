package com.example.demo.modules.me.badges;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.material.mapper.MaterialRequestMapper;
import com.example.demo.modules.me.dto.PendingBadgesView;
import com.example.demo.modules.notification.service.NotificationService;
import com.example.demo.modules.policy.BizDomains;
import com.example.demo.modules.policy.service.CapabilityPolicyService;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.util.Map;

@Component
@Order(41)
public class MaterialPendingBadgeContributor implements PendingBadgeContributor {

    private final MaterialRequestMapper requestMapper;
    private final CapabilityPolicyService capabilityPolicyService;
    private final NotificationService notificationService;

    public MaterialPendingBadgeContributor(MaterialRequestMapper requestMapper,
                                            CapabilityPolicyService capabilityPolicyService,
                                            NotificationService notificationService) {
        this.requestMapper = requestMapper;
        this.capabilityPolicyService = capabilityPolicyService;
        this.notificationService = notificationService;
    }

    @Override
    public void contribute(User user, PendingBadgesView view, Map<String, Integer> badgeCounters) {
        RoleEnum role = user.getRole() == null ? RoleEnum.STUDENT : user.getRole();
        if (role.getLevel() < RoleEnum.STAFF.getLevel()) return;

        int applicantUnread = notificationService.countUnreadWorkOrderForApplicant(user.getId(), BizDomains.MATERIAL_REQUEST);
        view.setMaterial(applicantUnread);
        badgeCounters.put(BizDomains.MATERIAL_REQUEST + "_APPLICANT", applicantUnread);
        badgeCounters.put("materialRequest", applicantUnread);

        if (capabilityPolicyService.canProcess(user, BizDomains.MATERIAL_REQUEST)) {
            int procUnread = notificationService.countUnreadWorkOrderForProcessor(user.getId(), BizDomains.MATERIAL_REQUEST);
            int procPending = requestMapper.countPendingReview();
            int proc = Math.max(procUnread, procPending);
            view.setProcessMaterial(proc);
            badgeCounters.put(BizDomains.MATERIAL_REQUEST + "_PROCESS", proc);
            badgeCounters.put("processMaterialRequest", proc);
        }
    }
}
