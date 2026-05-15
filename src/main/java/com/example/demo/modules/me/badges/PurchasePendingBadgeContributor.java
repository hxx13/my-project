package com.example.demo.modules.me.badges;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.me.dto.PendingBadgesView;
import com.example.demo.modules.policy.BizDomains;
import com.example.demo.modules.policy.service.CapabilityPolicyService;
import com.example.demo.modules.purchase.enums.PurchaseOrderStatus;
import com.example.demo.modules.purchase.mapper.PurchaseOrderMapper;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.util.Map;

@Component
@Order(30)
public class PurchasePendingBadgeContributor implements PendingBadgeContributor {

    private final PurchaseOrderMapper purchaseOrderMapper;
    private final CapabilityPolicyService capabilityPolicyService;

    public PurchasePendingBadgeContributor(PurchaseOrderMapper purchaseOrderMapper,
                                           CapabilityPolicyService capabilityPolicyService) {
        this.purchaseOrderMapper = purchaseOrderMapper;
        this.capabilityPolicyService = capabilityPolicyService;
    }

    @Override
    public void contribute(User user, PendingBadgesView view, Map<String, Integer> badgeCounters) {
        RoleEnum role = user.getRole() == null ? RoleEnum.STUDENT : user.getRole();
        if (role.getLevel() < RoleEnum.STAFF.getLevel()) {
            return;
        }
        int applicant = countApplicant(user.getId());
        view.setPurchase(applicant);
        badgeCounters.put(BizDomains.PURCHASE + "_APPLICANT", applicant);
        badgeCounters.put("purchase", applicant);

        /** 与列表接口 requireProcess 一致：按策略 canProcess，避免仅 role.level 与 DB 阈值不一致时漏掉处理角标 */
        if (capabilityPolicyService.canProcess(user, BizDomains.PURCHASE)) {
            int proc = countProcessor();
            view.setProcessPurchase(proc);
            badgeCounters.put(BizDomains.PURCHASE + "_PROCESS", proc);
            badgeCounters.put("processPurchase", proc);
        }
    }

    /** 角标仅统计本人申请单，与列表「可见公开单」策略解耦 */
    private int countApplicant(String userId) {
        int a = purchaseOrderMapper.countForApplicant(userId, PurchaseOrderStatus.PENDING.name(), null, null);
        int b = purchaseOrderMapper.countForApplicant(userId, PurchaseOrderStatus.PROCESSING.name(), null, null);
        return a + b;
    }

    private int countProcessor() {
        int a = sumProcessorPool(PurchaseOrderStatus.PENDING.name());
        int b = sumProcessorPool(PurchaseOrderStatus.PROCESSING.name());
        return a + b;
    }

    private int sumProcessorPool(String status) {
        return purchaseOrderMapper.countAll(status, null, null);
    }
}
