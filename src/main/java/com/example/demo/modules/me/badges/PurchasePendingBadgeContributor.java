package com.example.demo.modules.me.badges;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.me.dto.PendingBadgesView;
import com.example.demo.modules.policy.BizDomains;
import com.example.demo.modules.policy.service.CapabilityPolicyService;
import com.example.demo.modules.notification.service.NotificationService;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.util.Map;

@Component
@Order(30)
public class PurchasePendingBadgeContributor implements PendingBadgeContributor {

    private final NotificationService notificationService;
    private final CapabilityPolicyService capabilityPolicyService;

    public PurchasePendingBadgeContributor(NotificationService notificationService,
                                           CapabilityPolicyService capabilityPolicyService) {
        this.notificationService = notificationService;
        this.capabilityPolicyService = capabilityPolicyService;
    }

    @Override
    public void contribute(User user, PendingBadgesView view, Map<String, Integer> badgeCounters) {
        RoleEnum role = user.getRole() == null ? RoleEnum.STUDENT : user.getRole();
        if (role.getLevel() < RoleEnum.STAFF.getLevel()) {
            return;
        }
        int applicant = notificationService.countUnreadWorkOrderForApplicant(user.getId(), "PURCHASE");
        view.setPurchase(applicant);
        badgeCounters.put(BizDomains.PURCHASE + "_APPLICANT", applicant);
        badgeCounters.put("purchase", applicant);

        /** 与列表接口 requireProcess 一致：按策略 canProcess，避免仅 role.level 与 DB 阈值不一致时漏掉处理角标 */
        if (capabilityPolicyService.canProcess(user, BizDomains.PURCHASE)) {
            int proc = notificationService.countUnreadWorkOrderForProcessor(user.getId(), "PURCHASE");
            view.setProcessPurchase(proc);
            badgeCounters.put(BizDomains.PURCHASE + "_PROCESS", proc);
            badgeCounters.put("processPurchase", proc);
        }
    }
}
