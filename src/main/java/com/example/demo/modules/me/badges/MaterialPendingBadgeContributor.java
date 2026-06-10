package com.example.demo.modules.me.badges;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.material.mapper.MaterialRequestMapper;
import com.example.demo.modules.me.dto.PendingBadgesView;
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

    public MaterialPendingBadgeContributor(MaterialRequestMapper requestMapper,
                                            CapabilityPolicyService capabilityPolicyService) {
        this.requestMapper = requestMapper;
        this.capabilityPolicyService = capabilityPolicyService;
    }

    @Override
    public void contribute(User user, PendingBadgesView view, Map<String, Integer> badgeCounters) {
        RoleEnum role = user.getRole() == null ? RoleEnum.STUDENT : user.getRole();
        if (role.getLevel() < RoleEnum.STAFF.getLevel()) return;

        int mine = requestMapper.countByUserId(user.getId(), "PENDING");
        badgeCounters.put(BizDomains.MATERIAL_REQUEST + "_APPLICANT", mine);
        badgeCounters.put("materialRequest", mine);

        if (capabilityPolicyService.canProcess(user, BizDomains.MATERIAL_REQUEST)) {
            int proc = requestMapper.countAll("PENDING");
            badgeCounters.put(BizDomains.MATERIAL_REQUEST + "_PROCESS", proc);
            badgeCounters.put("processMaterialRequest", proc);
        }
    }
}
