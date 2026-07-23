package com.example.demo.modules.me.badges;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.material.service.MaterialService;
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

    private final MaterialService materialService;
    private final CapabilityPolicyService capabilityPolicyService;
    private final NotificationService notificationService;

    public MaterialPendingBadgeContributor(MaterialService materialService,
                                            CapabilityPolicyService capabilityPolicyService,
                                            NotificationService notificationService) {
        this.materialService = materialService;
        this.capabilityPolicyService = capabilityPolicyService;
        this.notificationService = notificationService;
    }

    @Override
    public void contribute(User user, PendingBadgesView view, Map<String, Integer> badgeCounters) {
        RoleEnum role = user.getRole() == null ? RoleEnum.MEMBER : user.getRole();

        int applicantUnread = notificationService.countUnreadWorkOrderForApplicant(user.getId(), BizDomains.MATERIAL_REQUEST);
        view.setMaterial(applicantUnread);
        badgeCounters.put(BizDomains.MATERIAL_REQUEST + "_APPLICANT", applicantUnread);
        badgeCounters.put("materialRequest", applicantUnread);

        if (role.getLevel() < RoleEnum.STAFF.getLevel()) return;

        if (capabilityPolicyService.canProcess(user, BizDomains.MATERIAL_REQUEST)) {
            // 与 MaterialReviewPage / listPendingForReview 同源；勿用未读通知数（已审结通知仍会导致角标误报）
            int procPending = materialService.countPendingForReviewer(user);
            view.setProcessMaterial(procPending);
            badgeCounters.put(BizDomains.MATERIAL_REQUEST + "_PROCESS", procPending);
            badgeCounters.put("processMaterialRequest", procPending);
        }
    }
}
