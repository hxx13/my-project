package com.example.demo.modules.me.badges;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.cageshelf.service.CageOperationService;
import com.example.demo.modules.me.dto.PendingBadgesView;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.util.Map;

/**
 * 笼位分笼/转移待审角标贡献者：复用 {@link CageOperationService#pending} 的审核人归属过滤
 * （负责楼层/房间内，ADMIN 全量），与待审列表同一口径，避免角标和列表数目对不上。
 */
@Component
@Order(43)
public class CageOpPendingBadgeContributor implements PendingBadgeContributor {

    private final CageOperationService opService;

    public CageOpPendingBadgeContributor(CageOperationService opService) {
        this.opService = opService;
    }

    @Override
    public void contribute(User user, PendingBadgesView view, Map<String, Integer> badgeCounters) {
        RoleEnum role = user.getRole() == null ? RoleEnum.MEMBER : user.getRole();
        if (role.getLevel() < RoleEnum.STAFF.getLevel()) return;
        badgeCounters.put("processCageOp", opService.pending(user, null).size());
    }
}
