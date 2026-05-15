package com.example.demo.modules.me.badges;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.me.dto.PendingBadgesView;
import com.example.demo.modules.policy.BizDomains;
import com.example.demo.modules.policy.service.CapabilityPolicyService;
import com.example.demo.modules.repair.enums.RepairOrderStatus;
import com.example.demo.modules.repair.mapper.RepairOrderMapper;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.util.Map;

@Component
@Order(20)
public class RepairPendingBadgeContributor implements PendingBadgeContributor {

    private final RepairOrderMapper repairOrderMapper;
    private final CapabilityPolicyService capabilityPolicyService;

    public RepairPendingBadgeContributor(RepairOrderMapper repairOrderMapper,
                                         CapabilityPolicyService capabilityPolicyService) {
        this.repairOrderMapper = repairOrderMapper;
        this.capabilityPolicyService = capabilityPolicyService;
    }

    @Override
    public void contribute(User user, PendingBadgesView view, Map<String, Integer> badgeCounters) {
        RoleEnum role = user.getRole() == null ? RoleEnum.STUDENT : user.getRole();
        if (role.getLevel() < RoleEnum.STAFF.getLevel()) {
            return;
        }
        int applicant = countApplicant(user.getId());
        view.setRepair(applicant);
        badgeCounters.put(BizDomains.REPAIR + "_APPLICANT", applicant);
        badgeCounters.put("repair", applicant);

        if (capabilityPolicyService.canProcess(user, BizDomains.REPAIR)) {
            int proc = countProcessor();
            view.setProcessRepair(proc);
            badgeCounters.put(BizDomains.REPAIR + "_PROCESS", proc);
            badgeCounters.put("processRepair", proc);
        }
    }

    /** 角标仅统计本人申请单，与列表「可见公开单」策略解耦，避免非申请人看到他人工单角标 */
    private int countApplicant(String userId) {
        int a = repairOrderMapper.countForApplicant(userId, RepairOrderStatus.PENDING.name(), null, null);
        int b = repairOrderMapper.countForApplicant(userId, RepairOrderStatus.PROCESSING.name(), null, null);
        return a + b;
    }

    private int countProcessor() {
        int a = sumProcessorPool(RepairOrderStatus.PENDING.name());
        int b = sumProcessorPool(RepairOrderStatus.PROCESSING.name());
        return a + b;
    }

    private int sumProcessorPool(String status) {
        return repairOrderMapper.countAll(status, null, null);
    }
}
