package com.example.demo.modules.me.badges;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.cageshelf.service.CageClaimService;
import com.example.demo.modules.me.dto.PendingBadgesView;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.util.Map;

/**
 * 笼位申请待审角标贡献者：按审核人过滤（负责楼层/房间内），ADMIN 全量。
 * 计数写 badgeCounters Map（新域优先走 Map，不新增 int 字段）。
 */
@Component
@Order(42)
public class CageClaimPendingBadgeContributor implements PendingBadgeContributor {

    private final CageClaimService cageClaimService;

    public CageClaimPendingBadgeContributor(CageClaimService cageClaimService) {
        this.cageClaimService = cageClaimService;
    }

    @Override
    public void contribute(User user, PendingBadgesView view, Map<String, Integer> badgeCounters) {
        RoleEnum role = user.getRole() == null ? RoleEnum.MEMBER : user.getRole();
        if (role.getLevel() < RoleEnum.STAFF.getLevel()) return;
        int pending = cageClaimService.countPendingForReviewer(user);
        badgeCounters.put("processCageClaim", pending);
    }
}
