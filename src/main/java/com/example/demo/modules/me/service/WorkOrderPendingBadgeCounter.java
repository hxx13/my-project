package com.example.demo.modules.me.service;

import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.policy.BizDomains;
import com.example.demo.modules.policy.service.CapabilityPolicyService;
import com.example.demo.modules.purchase.mapper.PurchaseOrderMapper;
import com.example.demo.modules.repair.mapper.RepairOrderMapper;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

/**
 * 报修/采购角标：与物资领用一致，按「待处理/处理中」工单条数计数，避免未读通知条数 inflated 角标。
 */
@Service
public class WorkOrderPendingBadgeCounter {

    private final RepairOrderMapper repairOrderMapper;
    private final PurchaseOrderMapper purchaseOrderMapper;
    private final CapabilityPolicyService capabilityPolicyService;

    public WorkOrderPendingBadgeCounter(RepairOrderMapper repairOrderMapper,
                                        PurchaseOrderMapper purchaseOrderMapper,
                                        CapabilityPolicyService capabilityPolicyService) {
        this.repairOrderMapper = repairOrderMapper;
        this.purchaseOrderMapper = purchaseOrderMapper;
        this.capabilityPolicyService = capabilityPolicyService;
    }

    /** 申请人侧：本人待处理报修单数 */
    public int countRepairApplicantPending(String userId) {
        if (!StringUtils.hasText(userId)) {
            return 0;
        }
        return repairOrderMapper.countForApplicant(userId.trim(), "PENDING", null, null);
    }

    /** 处理侧：可见队列中待处理 + 处理中报修单数 */
    public int countRepairProcessPending(User user) {
        if (user == null || !capabilityPolicyService.canProcess(user, BizDomains.REPAIR)) {
            return 0;
        }
        if (capabilityPolicyService.canViewAllPending(user, BizDomains.REPAIR)) {
            return repairOrderMapper.countAll("PENDING", null, null)
                    + repairOrderMapper.countAll("PROCESSING", null, null);
        }
        String uid = user.getId();
        if (!StringUtils.hasText(uid)) {
            return 0;
        }
        return repairOrderMapper.countVisible(uid.trim(), "PENDING", null, null)
                + repairOrderMapper.countVisible(uid.trim(), "PROCESSING", null, null);
    }

    /** 申请人侧：本人待处理采购单数 */
    public int countPurchaseApplicantPending(String userId) {
        if (!StringUtils.hasText(userId)) {
            return 0;
        }
        return purchaseOrderMapper.countForApplicant(userId.trim(), "PENDING", null, null);
    }

    /** 处理侧：可见队列中待处理 + 处理中采购单数 */
    public int countPurchaseProcessPending(User user) {
        if (user == null || !capabilityPolicyService.canProcess(user, BizDomains.PURCHASE)) {
            return 0;
        }
        if (capabilityPolicyService.canViewAllPending(user, BizDomains.PURCHASE)) {
            return purchaseOrderMapper.countAll("PENDING", null, null)
                    + purchaseOrderMapper.countAll("PROCESSING", null, null);
        }
        String uid = user.getId();
        if (!StringUtils.hasText(uid)) {
            return 0;
        }
        return purchaseOrderMapper.countVisible(uid.trim(), "PENDING", null, null)
                + purchaseOrderMapper.countVisible(uid.trim(), "PROCESSING", null, null);
    }
}
