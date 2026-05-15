package com.example.demo.modules.me.badges;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.me.dto.PendingBadgesView;
import com.example.demo.modules.policy.BizDomains;
import com.example.demo.modules.policy.service.CapabilityPolicyService;
import com.example.demo.modules.supplies.mapper.SupplyClaimOrderMapper;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.util.Map;

@Component
@Order(40)
public class SuppliesPendingBadgeContributor implements PendingBadgeContributor {

    private final SupplyClaimOrderMapper claimOrderMapper;
    private final CapabilityPolicyService capabilityPolicyService;

    public SuppliesPendingBadgeContributor(SupplyClaimOrderMapper claimOrderMapper,
                                           CapabilityPolicyService capabilityPolicyService) {
        this.claimOrderMapper = claimOrderMapper;
        this.capabilityPolicyService = capabilityPolicyService;
    }

    @Override
    public void contribute(User user, PendingBadgesView view, Map<String, Integer> badgeCounters) {
        RoleEnum role = user.getRole() == null ? RoleEnum.STUDENT : user.getRole();
        if (role.getLevel() < RoleEnum.STAFF.getLevel()) {
            return;
        }
        /** 申请人侧角标：本人「我的记录」中待出库（PENDING）单数；非处理者首页/我的领用入口仅展示此项 */
        int mine = claimOrderMapper.countMine(user.getId(), "PENDING");
        view.setSupplies(mine);
        badgeCounters.put(BizDomains.SUPPLIES_CLAIM + "_APPLICANT", mine);
        badgeCounters.put("supplies", mine);

        if (capabilityPolicyService.canProcess(user, BizDomains.SUPPLIES_CLAIM)) {
            int proc = claimOrderMapper.countPendingAll();
            view.setProcessSupplies(proc);
            badgeCounters.put(BizDomains.SUPPLIES_CLAIM + "_PROCESS", proc);
            badgeCounters.put("processSupplies", proc);
        }
    }
}
