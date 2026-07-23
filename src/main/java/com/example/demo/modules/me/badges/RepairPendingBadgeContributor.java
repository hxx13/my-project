package com.example.demo.modules.me.badges;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.me.dto.PendingBadgesView;
import com.example.demo.modules.policy.BizDomains;
import com.example.demo.modules.policy.service.CapabilityPolicyService;
import com.example.demo.modules.me.service.WorkOrderPendingBadgeCounter;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.util.Map;

@Component
@Order(20)
public class RepairPendingBadgeContributor implements PendingBadgeContributor {

    private final WorkOrderPendingBadgeCounter workOrderPendingBadgeCounter;
    private final CapabilityPolicyService capabilityPolicyService;

    public RepairPendingBadgeContributor(WorkOrderPendingBadgeCounter workOrderPendingBadgeCounter,
                                         CapabilityPolicyService capabilityPolicyService) {
        this.workOrderPendingBadgeCounter = workOrderPendingBadgeCounter;
        this.capabilityPolicyService = capabilityPolicyService;
    }

    @Override
    public void contribute(User user, PendingBadgesView view, Map<String, Integer> badgeCounters) {
        RoleEnum role = user.getRole() == null ? RoleEnum.MEMBER : user.getRole();
        if (role.getLevel() < RoleEnum.STAFF.getLevel()) {
            return;
        }
        int applicant = workOrderPendingBadgeCounter.countRepairApplicantPending(user.getId());
        view.setRepair(applicant);
        badgeCounters.put(BizDomains.REPAIR + "_APPLICANT", applicant);
        badgeCounters.put("repair", applicant);

        if (capabilityPolicyService.canProcess(user, BizDomains.REPAIR)) {
            int proc = workOrderPendingBadgeCounter.countRepairProcessPending(user);
            view.setProcessRepair(proc);
            badgeCounters.put(BizDomains.REPAIR + "_PROCESS", proc);
            badgeCounters.put("processRepair", proc);
        }
    }
}
